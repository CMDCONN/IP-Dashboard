import express from 'express';
const router = express.Router();
import { getDB } from '../database.js';
import ping from 'ping';

let watchIntervals = {};

router.get('/', (req, res) => {
  const db = getDB();
  db.all('SELECT * FROM ip_addresses ORDER BY created_at DESC', [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

router.post('/', (req, res) => {
  const { ip, name, description, watch_interval, is_watching } = req.body;
  const db = getDB();
  
  db.run(
    'INSERT INTO ip_addresses (ip, name, description, watch_interval, is_watching) VALUES (?, ?, ?, ?, ?)',
    [ip, name || '', description || '', watch_interval || 60, is_watching ? 1 : 0],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      
      const newId = this.lastID;
      
      if (is_watching) {
        startWatching(newId, ip, watch_interval || 60);
      }
      
      db.get('SELECT * FROM ip_addresses WHERE id = ?', [newId], (err, row) => {
        if (err) {
          res.status(500).json({ error: err.message });
          return;
        }
        res.json(row);
      });
    }
  );
});

router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { ip, name, description, watch_interval, is_watching } = req.body;
  const db = getDB();
  
  db.run(
    'UPDATE ip_addresses SET ip = ?, name = ?, description = ?, watch_interval = ?, is_watching = ? WHERE id = ?',
    [ip, name || '', description || '', watch_interval || 60, is_watching ? 1 : 0, id],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      
      if (watchIntervals[id]) {
        clearInterval(watchIntervals[id]);
        delete watchIntervals[id];
      }
      
      if (is_watching) {
        startWatching(parseInt(id), ip, watch_interval || 60);
      }
      
      db.get('SELECT * FROM ip_addresses WHERE id = ?', [id], (err, row) => {
        if (err) {
          res.status(500).json({ error: err.message });
          return;
        }
        res.json(row);
      });
    }
  );
});

router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const db = getDB();
  
  if (watchIntervals[id]) {
    clearInterval(watchIntervals[id]);
    delete watchIntervals[id];
  }
  
  db.run('DELETE FROM ping_history WHERE ip_id = ?', [id], (err) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    db.run('DELETE FROM ip_addresses WHERE id = ?', [id], (err) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ message: 'IP deleted successfully' });
    });
  });
});

router.get('/:id/history', (req, res) => {
  const { id } = req.params;
  const db = getDB();
  
  db.all(
    'SELECT * FROM ping_history WHERE ip_id = ? ORDER BY timestamp DESC LIMIT 100',
    [id],
    (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json(rows);
    }
  );
});

router.post('/:id/ping', async (req, res) => {
  const { id } = req.params;
  const db = getDB();
  
  db.get('SELECT * FROM ip_addresses WHERE id = ?', [id], async (err, ipRow) => {
    if (err || !ipRow) {
      res.status(404).json({ error: 'IP not found' });
      return;
    }
    
    const result = await pingIP(ipRow.ip);
    
    db.run(
      'INSERT INTO ping_history (ip_id, status, response_time) VALUES (?, ?, ?)',
      [id, result.status, result.time],
      function(err) {
        if (err) {
          console.error(err);
        }
      }
    );
    
    db.run(
      'UPDATE ip_addresses SET last_status = ?, last_check = CURRENT_TIMESTAMP WHERE id = ?',
      [result.status, id],
      function(err) {
        if (err) {
          res.status(500).json({ error: err.message });
          return;
        }
        
        db.get('SELECT * FROM ip_addresses WHERE id = ?', [id], (err, row) => {
          if (err) {
            res.status(500).json({ error: err.message });
            return;
          }
          res.json({ ...row, ping_result: result });
        });
      }
    );
  });
});

async function pingIP(ip) {
  try {
    const result = await ping.promise.probe(ip, {
      timeout: 5,
      extra: ['-n', '1']
    });
    
    return {
      status: result.alive ? 'up' : 'down',
      time: result.time ? Math.round(result.time) : null
    };
  } catch (error) {
    return {
      status: 'down',
      time: null
    };
  }
}

function startWatching(id, ip, interval) {
  const intervalMs = interval * 1000;
  
  watchIntervals[id] = setInterval(async () => {
    const db = getDB();
    const result = await pingIP(ip);
    
    db.run(
      'INSERT INTO ping_history (ip_id, status, response_time) VALUES (?, ?, ?)',
      [id, result.status, result.time],
      function(err) {
        if (err) {
          console.error(err);
        }
      }
    );
    
    db.run(
      'UPDATE ip_addresses SET last_status = ?, last_check = CURRENT_TIMESTAMP WHERE id = ?',
      [result.status, id],
      function(err) {
        if (err) {
          console.error(err);
        }
      }
    );
  }, intervalMs);
  
  console.log(`Started watching ${ip} every ${interval} seconds`);
}

function initWatching() {
  const db = getDB();
  db.all('SELECT * FROM ip_addresses WHERE is_watching = 1', [], (err, rows) => {
    if (err) {
      console.error(err);
      return;
    }
    
    rows.forEach(row => {
      startWatching(row.id, row.ip, row.watch_interval);
    });
  });
}

initWatching();

export default router;
