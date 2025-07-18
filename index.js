
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const mm = require('music-metadata');
const fs = require('fs');
const path = require('path');

const app = express();
const port = 3000;
const songsDir = path.join(__dirname, 'songs');
const dbFile = path.join(__dirname, 'music.db');

let db = new sqlite3.Database(dbFile, (err) => {
    if (err) {
        console.error(err.message);
    }
    console.log('Connected to the music database.');
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS songs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        artist TEXT,
        album TEXT,
        genre TEXT,
        year INTEGER,
        path TEXT UNIQUE
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS playlists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS playlist_songs (
        playlist_id INTEGER,
        song_id INTEGER,
        FOREIGN KEY (playlist_id) REFERENCES playlists(id),
        FOREIGN KEY (song_id) REFERENCES songs(id)
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS favourites (
        song_id INTEGER UNIQUE,
        FOREIGN KEY (song_id) REFERENCES songs(id)
    )`);
});

app.use(express.json());
app.use(express.static('public'));

async function scanSongs() {
    const files = fs.readdirSync(songsDir);
    for (const file of files) {
        const filePath = path.join(songsDir, file);
        try {
            const metadata = await mm.parseFile(filePath);
            const { title, artist, album, genre, year } = metadata.common;
            db.run(`INSERT OR IGNORE INTO songs (title, artist, album, genre, year, path) VALUES (?, ?, ?, ?, ?, ?)`,
                [title, artist, album, genre ? genre.join(', ') : '', year, filePath],
                (err) => {
                    if (err) {
                        console.error(err.message);
                    }
                });
        } catch (error) {
            console.error('Error parsing metadata for file:', filePath, error.message);
        }
    }
    console.log('Song scan complete.');
}

app.get('/songs', (req, res) => {
    db.all('SELECT * FROM songs', [], (err, rows) => {
        if (err) {
            res.status(500).send(err.message);
            return;
        }
        res.json(rows);
    });
});

app.get('/artists', (req, res) => {
    db.all('SELECT DISTINCT artist FROM songs', [], (err, rows) => {
        if (err) {
            res.status(500).send(err.message);
            return;
        }
        res.json(rows.map(row => row.artist));
    });
});

app.get('/albums', (req, res) => {
    db.all('SELECT DISTINCT album, artist FROM songs', [], (err, rows) => {
        if (err) {
            res.status(500).send(err.message);
            return;
        }
        res.json(rows);
    });
});

app.get('/genres', (req, res) => {
    db.all('SELECT DISTINCT genre FROM songs', [], (err, rows) => {
        if (err) {
            res.status(500).send(err.message);
            return;
        }
        res.json(rows.map(row => row.genre));
    });
});

app.get('/song/:id', (req, res) => {
    db.get('SELECT path FROM songs WHERE id = ?', [req.params.id], (err, row) => {
        if (err) {
            res.status(500).send(err.message);
            return;
        }
        if (row) {
            res.sendFile(path.join(__dirname, row.path));
        } else {
            res.status(404).send('Song not found');
        }
    });
});

app.post('/refresh', async (req, res) => {
    await scanSongs();
    res.send('Library refreshed');
});

const startServer = async () => {
    await scanSongs();
    app.listen(port, () => {
        console.log(`Server listening at http://localhost:${port}`);
    });
};

startServer();
