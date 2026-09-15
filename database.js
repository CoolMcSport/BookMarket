const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./books.db", (err) => {
    if (err) {
        console.error("Ошибка подключения к базе:", err.message);
    } else {
        console.log("База данных подключена.");
    }
});

db.serialize(() => {
    // Таблица пользователей
    db.run(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
`);
db.run(
    "ALTER TABLE users ADD COLUMN username TEXT",
    (err) => {
        if (err && !err.message.includes("duplicate column name")) {
            console.error(err.message);
        }
    }
);
    // Таблица книг
    db.run(`
        CREATE TABLE IF NOT EXISTS books (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            title TEXT NOT NULL,
            author TEXT NOT NULL,
            price TEXT NOT NULL,
            description TEXT,
            image TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    // Добавляем user_id в старую таблицу, если столбца ещё нет
    db.run(
        "ALTER TABLE books ADD COLUMN user_id INTEGER",
        (err) => {
            if (err && !err.message.includes("duplicate column name")) {
                console.error("Ошибка добавления user_id:", err.message);
            }
        }
    );

    // Добавляем created_at в старую таблицу, если столбца ещё нет
    db.run(
        "ALTER TABLE books ADD COLUMN created_at TEXT",
        (err) => {
            if (err && !err.message.includes("duplicate column name")) {
                console.error("Ошибка добавления created_at:", err.message);
            }
        }
    );
});

module.exports = db;