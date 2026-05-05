import express from 'express';
import net from 'net';
import dns from 'dns';
import os from 'os';
import ping from 'ping';
import { getDB } from '../database.js';
import { promisify } from 'util';

const router = express.Router();

function isPrivateIP(ip) {
  const parts = ip.split('.').map(Number);
  if (parts[0] === 10) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  return false;
}

function isLikelyVPNOrVirtual(adapterName) {
  const keywords = [
    'vpn', 'openvpn', 'tailscale', 'zerotier', 'wireguard', 'tap-windows',
    'virtual', 'vmware', 'virtualbox', 'hyper-v', 'vethernet', 'pseudo',
    'loopback', 'tunnel', 'ppp', 'wan miniport'
  ];
  const lowerName = adapterName.toLowerCase();
  return keywords.some(keyword => lowerName.includes(keyword));
}

function isPhysicalAdapterName(adapterName) {
  const physicalKeywords = [
    'wi-fi', 'wifi', 'wireless', 'ethernet', 'lan', 'local area', 'network adapter'
  ];
  const lowerName = adapterName.toLowerCase();
  return physicalKeywords.some(keyword => lowerName.includes(keyword));
}

function getLocalNetwork() {
  const interfaces = os.networkInterfaces();
  let physicalCandidates = [];
  let otherCandidates = [];
  
  for (const name of Object.keys(interfaces)) {
    if (isLikelyVPNOrVirtual(name)) continue;
    
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal && isPrivateIP(iface.address)) {
        const ipParts = iface.address.split('.');
        const network = `${ipParts[0]}.${ipParts[1]}.${ipParts[2]}.0/24`;
        const candidate = { 
          name, 
          ip: iface.address, 
          network, 
          isPhysical: isPhysicalAdapterName(name) 
        };
        
        if (candidate.isPhysical) {
          physicalCandidates.push(candidate);
        } else {
          otherCandidates.push(candidate);
        }
      }
    }
  }
  
  const allCandidates = [...physicalCandidates, ...otherCandidates];
  
  if (allCandidates.length > 0) {
    return { ip: allCandidates[0].ip, network: allCandidates[0].network };
  }
  
  return { ip: '127.0.0.1', network: '192.168.1.0/24' };
}

router.get('/local', (req, res) => {
  const network = getLocalNetwork();
  res.json(network);
});

function ipToLong(ip) {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

function longToIp(long) {
  return [
    (long >>> 24) & 0xFF,
    (long >>> 16) & 0xFF,
    (long >>> 8) & 0xFF,
    long & 0xFF
  ].join('.');
}

function parseRange(rangeStr) {
  const trimmed = rangeStr.trim();
  
  if (trimmed.includes('/')) {
    const [ipPart, cidrPart] = trimmed.split('/');
    const prefix = parseInt(cidrPart, 10);
    const ipLong = ipToLong(ipPart);
    
    const mask = -1 << (32 - prefix);
    const network = ipLong & mask >>> 0;
    const broadcast = network | (~mask >>> 0);
    
    const ips = [];
    for (let i = network; i <= broadcast; i++) {
      ips.push(longToIp(i));
    }
    return ips;
  } else if (trimmed.includes('-')) {
    const [start, end] = trimmed.split('-').map(s => s.trim());
    const startLong = ipToLong(start);
    const endLong = ipToLong(end);
    const ips = [];
    
    for (let i = startLong; i <= endLong; i++) {
      ips.push(longToIp(i));
    }
    return ips;
  }
  
  return [];
}

function parsePortRange(portRangeStr) {
  if (!portRangeStr) return { start: 1, end: 1000 };
  const [start, end] = portRangeStr.split('-').map(s => parseInt(s.trim(), 10));
  return {
    start: start || 1,
    end: end || 1000
  };
}

async function scanPort(ip, port, timeout = 500) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeout);
    
    socket.on('connect', () => {
      socket.destroy();
      resolve(port);
    });
    
    socket.on('timeout', () => {
      socket.destroy();
      resolve(null);
    });
    
    socket.on('error', () => {
      resolve(null);
    });
    
    socket.connect(port, ip);
  });
}

async function scanPorts(ip, portRange) {
  const { start, end } = portRange;
  const openPorts = [];
  const concurrency = 100;
  
  for (let i = start; i <= end; i += concurrency) {
    const batch = [];
    for (let j = i; j < i + concurrency && j <= end; j++) {
      batch.push(scanPort(ip, j));
    }
    const results = await Promise.all(batch);
    openPorts.push(...results.filter(p => p !== null));
  }
  
  return openPorts;
}

const reverseDns = promisify(dns.reverse);

async function getHostname(ip) {
  try {
    const hostnames = await reverseDns(ip);
    return hostnames[0] || '';
  } catch (error) {
    return '';
  }
}

async function pingIP(ip) {
  try {
    const result = await ping.promise.probe(ip, {
      timeout: 2,
      extra: ['-n', '1']
    });
    return { ip, alive: result.alive };
  } catch (error) {
    return { ip, alive: false };
  }
}

async function processInParallel(items, processor, concurrency = 20) {
  const results = [];
  const executing = [];
  
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const promise = processor(item, i).then(result => {
      results.push(result);
      return result;
    });
    
    executing.push(promise);
    
    if (executing.length >= concurrency) {
      await Promise.race(executing);
      for (let j = executing.length - 1; j >= 0; j--) {
        if (executing[j].resolved) {
          executing.splice(j, 1);
        }
      }
    }
  }
  
  await Promise.all(executing);
  return results;
}

router.post('/', async (req, res) => {
  const { range, portRange: portRangeStr } = req.body;
  
  res.setHeader('Content-Type', 'text/plain');
  
  const ips = parseRange(range);
  const portRange = parsePortRange(portRangeStr);
  const db = getDB();
  let processed = 0;
  let found = 0;
  const total = ips.length;
  
  const pingConcurrency = 50;
  
  const pingPromises = ips.map((ip, index) => 
    pingIP(ip).then(result => {
      processed++;
      res.write(JSON.stringify({ 
        current: processed, 
        total, 
        found,
        phase: 'pinging'
      }) + '\n');
      return result;
    })
  );
  
  const aliveIPs = [];
  for (let i = 0; i < pingPromises.length; i += pingConcurrency) {
    const batch = pingPromises.slice(i, i + pingConcurrency);
    const batchResults = await Promise.all(batch);
    aliveIPs.push(...batchResults.filter(r => r.alive).map(r => r.ip));
    found = aliveIPs.length;
    res.write(JSON.stringify({ 
      current: Math.min(i + pingConcurrency, total), 
      total, 
      found,
      phase: 'pinging'
    }) + '\n');
  }
  
  for (let i = 0; i < aliveIPs.length; i++) {
    const ip = aliveIPs[i];
    const currentPhase = i + 1;
    const totalPhase = aliveIPs.length;
    
    res.write(JSON.stringify({ 
      current: total, 
      total, 
      found,
      phase: 'port-scanning',
      portScanCurrent: currentPhase,
      portScanTotal: totalPhase,
      currentIP: ip
    }) + '\n');
    
    const [hostname, openPorts] = await Promise.all([
      getHostname(ip),
      scanPorts(ip, portRange)
    ]);
    
    const notes = openPorts.length > 0 
      ? `Open ports: ${openPorts.join(', ')}` 
      : '';
    
    db.get('SELECT * FROM ip_addresses WHERE ip = ?', [ip], (err, existing) => {
      if (err) {
        console.error(err);
        return;
      }
      
      if (!existing) {
        db.run(
          `INSERT INTO ip_addresses 
           (ip, name, description, watch_interval, is_watching, last_status, last_check) 
           VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          [ip, hostname, notes, 60, 1, 'up'],
          function(err) {
            if (err) {
              console.error(err);
            }
          }
        );
      } else {
        db.run(
          `UPDATE ip_addresses 
           SET name = ?, description = ?, last_status = ?, last_check = CURRENT_TIMESTAMP 
           WHERE id = ?`,
          [existing.name || hostname, notes, 'up', existing.id],
          function(err) {
            if (err) {
              console.error(err);
            }
          }
        );
      }
    });
  }
  
  res.write(JSON.stringify({ 
    current: total, 
    total, 
    found,
    phase: 'complete'
  }) + '\n');
  
  res.end();
});

export default router;
