const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const db = require("./database");

const app = express();
const PORT = 3000;

const publicPath = path.join(__dirname, "public");
const uploadsPath = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadsPath)) {
    fs.mkdirSync(uploadsPath, { recursive: true });
}

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(
    session({
        secret: "bookmarket-secret-key",
        resave: false,
        saveUninitialized: false,
        cookie: {
            maxAge: 24 * 60 * 60 * 1000,
            httpOnly: true
        }
    })
);

app.use(express.static(publicPath));
app.use("/uploads", express.static(uploadsPath));

// Настройка загрузки фотографий
const storage = multer.diskStorage({
    destination: (req, file, callback) => {
        callback(null, uploadsPath);
    },

    filename: (req, file, callback) => {
        const extension = path.extname(file.originalname).toLowerCase();

        const uniqueName =
            `${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`;

        callback(null, uniqueName);
    }
});

const upload = multer({
    storage,

    limits: {
        fileSize: 5 * 1024 * 1024
    },

    fileFilter: (req, file, callback) => {
        const allowedTypes = [
            "image/jpeg",
            "image/png",
            "image/webp"
        ];

        if (!allowedTypes.includes(file.mimetype)) {
            return callback(
                new Error("Разрешены только изображения JPG, PNG и WEBP")
            );
        }

        callback(null, true);
    }
});

// Главная страница
app.get("/", (req, res) => {
    res.sendFile(path.join(publicPath, "index.html"));
});

// Регистрация пользователя
app.post("/register", async (req, res) => {
    const {
        name,
        username,
        email,
        password,
        passwordConfirm
    } = req.body;

    if (
        !name ||
        !username ||
        !email ||
        !password ||
        !passwordConfirm
    ) {
        return res.status(400).send("Заполните все поля");
    }

    const cleanName = name.trim();
    const cleanUsername = username.trim().toLowerCase();
    const cleanEmail = email.trim().toLowerCase();

    if (password !== passwordConfirm) {
        return res.status(400).send("Пароли не совпадают");
    }

    if (password.length < 6) {
        return res
            .status(400)
            .send("Пароль должен содержать минимум 6 символов");
    }

    const usernamePattern = /^[a-z0-9_]{3,20}$/;

    if (!usernamePattern.test(cleanUsername)) {
        return res.status(400).send(
            "Имя пользователя должно содержать от 3 до 20 символов: латинские буквы, цифры и знак _"
        );
    }

    db.get(
        `
        SELECT id, username, email
        FROM users
        WHERE username = ? OR email = ?
        `,
        [cleanUsername, cleanEmail],
        async (checkError, existingUser) => {
            if (checkError) {
                console.error(
                    "Ошибка проверки пользователя:",
                    checkError.message
                );

                return res
                    .status(500)
                    .send("Ошибка проверки данных");
            }

            if (existingUser) {
                if (existingUser.username === cleanUsername) {
                    return res
                        .status(400)
                        .send("Это имя пользователя уже занято");
                }

                return res
                    .status(400)
                    .send("Этот email уже зарегистрирован");
            }

            try {
                const passwordHash = await bcrypt.hash(password, 10);

                db.run(
                    `
                    INSERT INTO users (
                        name,
                        username,
                        email,
                        password_hash
                    )
                    VALUES (?, ?, ?, ?)
                    `,
                    [
                        cleanName,
                        cleanUsername,
                        cleanEmail,
                        passwordHash
                    ],
                    function (insertError) {
                        if (insertError) {
                            console.error(
                                "Ошибка регистрации:",
                                insertError.message
                            );

                            if (
                                insertError.message.includes(
                                    "UNIQUE constraint failed: users.username"
                                )
                            ) {
                                return res
                                    .status(400)
                                    .send("Это имя пользователя уже занято");
                            }

                            if (
                                insertError.message.includes(
                                    "UNIQUE constraint failed: users.email"
                                )
                            ) {
                                return res
                                    .status(400)
                                    .send("Этот email уже зарегистрирован");
                            }

                            return res
                                .status(500)
                                .send("Ошибка регистрации");
                        }

                        req.session.user = {
                            id: this.lastID,
                            name: cleanName,
                            username: cleanUsername,
                            email: cleanEmail
                        };

                        res.redirect("/profile.html");
                    }
                );
            } catch (hashError) {
                console.error(
                    "Ошибка шифрования пароля:",
                    hashError
                );

                res.status(500).send("Ошибка регистрации");
            }
        }
    );
});

// Добавление книги
app.post("/add-book", upload.single("image"), (req, res) => {
    const { title, author, price, description } = req.body;

    if (!title || !author || !price) {
        return res
            .status(400)
            .send("Заполните обязательные поля");
    }

    const image = req.file
        ? `/uploads/${req.file.filename}`
        : null;

    const userId = req.session.user
        ? req.session.user.id
        : null;

    db.run(
        `
        INSERT INTO books (
            user_id,
            title,
            author,
            price,
            description,
            image
        )
        VALUES (?, ?, ?, ?, ?, ?)
        `,
        [
            userId,
            title.trim(),
            author.trim(),
            price,
            description ? description.trim() : "",
            image
        ],
        function (error) {
            if (error) {
                console.error(
                    "Ошибка сохранения книги:",
                    error.message
                );

                if (req.file) {
                    fs.unlink(req.file.path, () => {});
                }

                return res
                    .status(500)
                    .send("Ошибка при сохранении книги");
            }

            res.redirect("/catalog.html");
        }
    );
});

// Получение всех книг
app.get("/books", (req, res) => {
    db.all(
        `
        SELECT
            books.*,
            users.username AS seller_username,
            users.name AS seller_name
        FROM books
        LEFT JOIN users ON users.id = books.user_id
        ORDER BY books.id DESC
        `,
        [],
        (error, rows) => {
            if (error) {
                console.error(
                    "Ошибка получения книг:",
                    error.message
                );

                return res.status(500).json({
                    error: "Не удалось загрузить книги"
                });
            }

            res.json(rows);
        }
    );
});
app.post("/login", (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).send("Введите email и пароль");
    }

    const cleanEmail = email.trim().toLowerCase();

    db.get(
        "SELECT * FROM users WHERE email = ?",
        [cleanEmail],
        async (error, user) => {
            if (error) {
                console.error(error.message);
                return res.status(500).send("Ошибка входа");
            }

            if (!user) {
                return res.status(400).send("Неверный email или пароль");
            }

            const passwordIsCorrect = await bcrypt.compare(
                password,
                user.password_hash
            );

            if (!passwordIsCorrect) {
                return res.status(400).send("Неверный email или пароль");
            }

            req.session.user = {
                id: user.id,
                name: user.name,
                username: user.username,
                email: user.email
            };

            res.redirect("/profile.html");
        }
    );
});
app.post("/logout", (req, res) => {
    req.session.destroy(() => {
        res.redirect("/");
    });
});

// Данные текущего пользователя
app.get("/api/me", (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({
            authenticated: false
        });
    }

    res.json({
        authenticated: true,
        user: req.session.user
    });
});

// Книги текущего пользователя
app.get("/api/my-books", (req, res) => {

    if (!req.session.user) {
        return res.status(401).json({
            error: "Сначала войдите в аккаунт"
        });
    }

    db.all(
        `
        SELECT *
        FROM books
        WHERE user_id = ?
        ORDER BY id DESC
        `,
        [req.session.user.id],
        (error, rows) => {

            if (error) {
                return res.status(500).json({
                    error: "Не удалось загрузить книги"
                });
            }

            res.json(rows);
        }
    );
});

// Обработка ошибок загрузки
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === "LIMIT_FILE_SIZE") {
            return res
                .status(400)
                .send("Фотография больше 5 МБ");
        }

        return res
            .status(400)
            .send(`Ошибка загрузки: ${error.message}`);
    }

    if (error) {
        console.error(error.message);
        return res.status(400).send(error.message);
    }

    next();
});

app.listen(PORT, () => {
    console.log(`Сервер запущен: http://localhost:${PORT}`);
});