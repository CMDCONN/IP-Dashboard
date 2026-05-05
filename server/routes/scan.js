import express from 'express';
import net from 'net';
import ping from 'ping';
import { getDB } from '../database.js';

const router = express.Router();

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
    
    const openPorts = await scanPorts(ip, portRange);
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
          [ip, '', notes, 60, 1, 'up'],
          function(err) {
            if (err) {
              console.error(err);
            }
          }
        );
      } else {
        db.run(
          `UPDATE ip_addresses 
           SET description = ?, last_status = ?, last_check = CURRENT_TIMESTAMP 
           WHERE id = ?`,
          [notes, 'up', existing.id],
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
