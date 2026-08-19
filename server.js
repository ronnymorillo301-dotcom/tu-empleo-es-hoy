const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Database = require("better-sqlite3");
const multer = require("multer");

// ======================================================
// CONFIGURACIÓN
// ======================================================

const PORT = Number(process.env.PORT) || 3000;

const IS_PRODUCTION = process.env.NODE_ENV === "production";

const ADMIN_EMAILS = new Set(
    String(process.env.ADMIN_EMAILS || "")
        .split(",")
        .map(email => email.trim().toLowerCase())
        .filter(Boolean)
);

const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const ROOT = __dirname;

const FRONTEND = path.join(ROOT, "frontend");

const DATABASE_DIR = path.join(ROOT, "database");

const CURRICULUMS = path.join(ROOT, "curriculums");


// Crear carpetas si no existen

for (const carpeta of [
    FRONTEND,
    DATABASE_DIR,
    CURRICULUMS
]) {

    if (!fs.existsSync(carpeta)) {

        fs.mkdirSync(carpeta, {
            recursive: true
        });

    }

}


// ======================================================
// BASE DE DATOS
// ======================================================

const db = new Database(
    path.join(
        DATABASE_DIR,
        "app.db"
    )
);


db.pragma("foreign_keys = ON");
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 5000");


// ======================================================
// CREAR TABLAS
// ======================================================

db.exec(`

    CREATE TABLE IF NOT EXISTS users (

        id INTEGER PRIMARY KEY AUTOINCREMENT,

        nombre TEXT NOT NULL,

        correo TEXT NOT NULL UNIQUE,

        contrasena TEXT NOT NULL,

        celular TEXT NOT NULL,

        fecha_registro TEXT
            DEFAULT CURRENT_TIMESTAMP

    );


    CREATE TABLE IF NOT EXISTS curriculums (

        id INTEGER PRIMARY KEY AUTOINCREMENT,

        usuario_id INTEGER NOT NULL,

        nombre_archivo TEXT NOT NULL,

        archivo_guardado TEXT NOT NULL,

        fecha_subida TEXT
            DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (usuario_id)
            REFERENCES users(id)
            ON DELETE CASCADE

    );


    CREATE TABLE IF NOT EXISTS ofertas (

        id INTEGER PRIMARY KEY AUTOINCREMENT,

        titulo TEXT NOT NULL,

        empresa TEXT NOT NULL,

        ubicacion TEXT NOT NULL,

        descripcion TEXT NOT NULL,

        salario TEXT,

        fecha_publicacion TEXT
            DEFAULT CURRENT_TIMESTAMP

    );


    CREATE TABLE IF NOT EXISTS postulaciones (

        id INTEGER PRIMARY KEY AUTOINCREMENT,

        usuario_id INTEGER NOT NULL,

        oferta_id INTEGER NOT NULL,

        fecha_postulacion TEXT
            DEFAULT CURRENT_TIMESTAMP,

        UNIQUE (
            usuario_id,
            oferta_id
        ),

        FOREIGN KEY (usuario_id)
            REFERENCES users(id)
            ON DELETE CASCADE,

        FOREIGN KEY (oferta_id)
            REFERENCES ofertas(id)
            ON DELETE CASCADE

    );

`);


// ======================================================
// SEGURIDAD DE CONTRASEÑAS
// ======================================================

function hashPassword(password) {

    const salt = crypto.randomBytes(16).toString("hex");

    const hash = crypto.scryptSync(
        password,
        salt,
        64,
        {
            N: 16384,
            r: 8,
            p: 1
        }
    ).toString("hex");

    return `scrypt$${salt}$${hash}`;

}

function verificarPassword(password, almacenada) {

    if (!almacenada) {
        return false;
    }

    // Compatibilidad con cuentas antiguas creadas antes de esta mejora.
    if (!almacenada.startsWith("scrypt$")) {
        const actual = Buffer.from(password);
        const esperada = Buffer.from(almacenada);

        if (actual.length !== esperada.length) {
            return false;
        }

        return crypto.timingSafeEqual(actual, esperada);
    }

    const partes = almacenada.split("$");

    if (partes.length !== 3) {
        return false;
    }

    const salt = partes[1];
    const hashEsperado = Buffer.from(partes[2], "hex");

    const hashActual = crypto.scryptSync(
        password,
        salt,
        64,
        {
            N: 16384,
            r: 8,
            p: 1
        }
    );

    return (
        hashActual.length === hashEsperado.length &&
        crypto.timingSafeEqual(hashActual, hashEsperado)
    );

}

// Convertir automáticamente contraseñas antiguas almacenadas en texto plano.
// Las cuentas nuevas siempre se guardan con scrypt.
const usuariosContrasenasAntiguas = db.prepare(`
    SELECT id, contrasena
    FROM users
    WHERE contrasena NOT LIKE 'scrypt$%'
`).all();

if (usuariosContrasenasAntiguas.length > 0) {

    const actualizarPassword = db.prepare(`
        UPDATE users
        SET contrasena = ?
        WHERE id = ?
    `);

    const migrar = db.transaction((usuarios) => {
        for (const usuario of usuarios) {
            actualizarPassword.run(
                hashPassword(usuario.contrasena),
                usuario.id
            );
        }
    });

    migrar(usuariosContrasenasAntiguas);
}


// ======================================================
// SESIONES
// ======================================================

const sesiones = new Map();

// Limpiar sesiones expiradas periódicamente.
setInterval(() => {

    const ahora = Date.now();

    for (const [token, sesion] of sesiones) {

        if (ahora - sesion.creada > SESSION_MAX_AGE_MS) {
            sesiones.delete(token);
        }

    }

}, 60 * 60 * 1000).unref();


// Crear sesión

function crearSesion(usuarioId) {

    const token =
        crypto
            .randomBytes(32)
            .toString("hex");


    sesiones.set(
        token,
        {
            usuarioId: usuarioId,
            creada: Date.now()
        }
    );


    return token;

}


// Obtener cookies

function parseCookies(cookieHeader) {

    const cookies = {};


    cookieHeader
        .split(";")
        .forEach(parte => {

            const posicion =
                parte.indexOf("=");


            if (posicion === -1) {
                return;
            }


            const nombre =
                parte
                    .substring(
                        0,
                        posicion
                    )
                    .trim();


            const valor =
                parte
                    .substring(
                        posicion + 1
                    )
                    .trim();


            try {

                cookies[nombre] =
                    decodeURIComponent(
                        valor
                    );

            } catch {

                cookies[nombre] =
                    valor;

            }

        });


    return cookies;

}


// ======================================================
// OBTENER USUARIO DE LA SESIÓN
// ======================================================

function obtenerUsuarioDesdeSesion(req) {

    const cookies =
        parseCookies(
            req.headers.cookie || ""
        );


    const token =
        cookies.session;


    if (!token) {
        return null;
    }


    const sesion =
        sesiones.get(token);


    if (!sesion) {
        return null;
    }


    if (Date.now() - sesion.creada > SESSION_MAX_AGE_MS) {
        sesiones.delete(token);
        return null;
    }


    const usuario =
        db.prepare(`

            SELECT
                id,
                nombre,
                correo,
                celular

            FROM users

            WHERE id = ?

        `).get(
            sesion.usuarioId
        );


    return usuario || null;

}


// ======================================================
// CERRAR SESIÓN
// ======================================================

function eliminarSesion(req) {

    const cookies =
        parseCookies(
            req.headers.cookie || ""
        );


    const token =
        cookies.session;


    if (token) {

        sesiones.delete(token);

    }

}


// ======================================================
// MULTER
// ======================================================

const storage =
    multer.diskStorage({

        destination: function (
            req,
            file,
            cb
        ) {

            cb(
                null,
                CURRICULUMS
            );

        },


        filename: function (
            req,
            file,
            cb
        ) {

            const extension =
                path
                    .extname(
                        file.originalname
                    )
                    .toLowerCase();


            const nombreSeguro =
                Date.now() +
                "-" +
                crypto
                    .randomBytes(8)
                    .toString("hex") +
                extension;


            cb(
                null,
                nombreSeguro
            );

        }

    });


// ======================================================
// CONFIGURACIÓN DE ARCHIVOS
// ======================================================

const upload =
    multer({

        storage: storage,

        limits: {

            fileSize:
                5 * 1024 * 1024

        },


        fileFilter:
            function (
                req,
                file,
                cb
            ) {

                const permitidos = [

                    "application/pdf",

                    "application/msword",

                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

                ];


                if (
                    !permitidos.includes(
                        file.mimetype
                    )
                ) {

                    return cb(
                        new Error(
                            "Solo se permiten archivos PDF, DOC y DOCX."
                        )
                    );

                }


                cb(
                    null,
                    true
                );

            }

    });
// ======================================================
// RESPONDER JSON
// ======================================================

function responderJSON(
    res,
    codigo,
    datos,
    cookies = []
) {

    const contenido =
        JSON.stringify(datos);


    const headers = {

        "Content-Type":
            "application/json; charset=utf-8",

        "Content-Length":
            Buffer.byteLength(
                contenido
            ),

        "Cache-Control":
            "no-store"

    };


    if (cookies.length > 0) {

        headers["Set-Cookie"] =
            cookies;

    }


    res.writeHead(
        codigo,
        headers
    );


    res.end(
        contenido
    );

}


// ======================================================
// RESPONDER TEXTO
// ======================================================

function responderTexto(
    res,
    codigo,
    texto
) {

    res.writeHead(
        codigo,
        {
            "Content-Type":
                "text/plain; charset=utf-8"
        }
    );


    res.end(texto);

}


// ======================================================
// LEER JSON ENVIADO DESDE EL FRONTEND
// ======================================================

function leerBody(req) {

    return new Promise(
        (resolve, reject) => {

            let body = "";


            req.on(
                "data",
                chunk => {

                    body +=
                        chunk.toString();


                    if (
                        body.length >
                        1024 * 1024
                    ) {

                        reject(
                            new Error(
                                "La solicitud es demasiado grande."
                            )
                        );


                        req.destroy();

                    }

                }
            );


            req.on(
                "end",
                () => {

                    try {

                        if (!body) {

                            resolve({});

                            return;

                        }


                        const datos =
                            JSON.parse(body);


                        resolve(datos);

                    } catch (error) {

                        reject(
                            new Error(
                                "JSON inválido."
                            )
                        );

                    }

                }
            );


            req.on(
                "error",
                reject
            );

        }
    );

}


// ======================================================
// SERVIR ARCHIVOS DEL FRONTEND
// ======================================================

function servirArchivo(
    res,
    archivo
) {

    const ruta =
        path.resolve(
            FRONTEND,
            archivo
        );


    const raiz =
        path.resolve(
            FRONTEND
        );


    // Evita acceder a archivos
    // fuera de la carpeta frontend

    if (
        ruta !== raiz &&
        !ruta.startsWith(
            raiz + path.sep
        )
    ) {

        responderTexto(
            res,
            403,
            "Acceso denegado."
        );

        return;

    }


    if (
        !fs.existsSync(ruta)
    ) {

        responderTexto(
            res,
            404,
            "Archivo no encontrado."
        );

        return;

    }


    const extension =
        path.extname(
            ruta
        ).toLowerCase();


    const tipos = {

        ".html":
            "text/html; charset=utf-8",

        ".css":
            "text/css; charset=utf-8",

        ".js":
            "application/javascript; charset=utf-8",

        ".json":
            "application/json; charset=utf-8",

        ".png":
            "image/png",

        ".jpg":
            "image/jpeg",

        ".jpeg":
            "image/jpeg",

        ".gif":
            "image/gif",

        ".svg":
            "image/svg+xml",

        ".ico":
            "image/x-icon"

    };


    res.writeHead(
        200,
        {
            "Content-Type":
                tipos[extension] ||
                "application/octet-stream"
        }
    );


    fs.createReadStream(
        ruta
    ).pipe(res);

}


// ======================================================
// SERVIDOR PRINCIPAL
// ======================================================

const server =
    http.createServer(
        async (
            req,
            res
        ) => {

            try {

                const url =
                    new URL(
                        req.url,
                        `http://${
                            req.headers.host ||
                            "localhost"
                        }`
                    );


                const ruta =
                    url.pathname;


                // Encabezados básicos de seguridad para producción.
                res.setHeader("X-Content-Type-Options", "nosniff");
                res.setHeader("X-Frame-Options", "DENY");
                res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
                res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

                if (IS_PRODUCTION) {
                    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
                }


                // ==========================================
                // PÁGINA PRINCIPAL
                // ==========================================

                if (
                    req.method === "GET" &&
                    ruta === "/"
                ) {

                    servirArchivo(
                        res,
                        "index.html"
                    );

                    return;

                }


                // ==========================================
                // ARCHIVOS DEL FRONTEND
                // ==========================================

                if (
                    req.method === "GET" &&
                    (
                        ruta.endsWith(".html") ||
                        ruta.endsWith(".css") ||
                        ruta.endsWith(".js") ||
                        ruta.endsWith(".png") ||
                        ruta.endsWith(".jpg") ||
                        ruta.endsWith(".jpeg") ||
                        ruta.endsWith(".gif") ||
                        ruta.endsWith(".svg") ||
                        ruta.endsWith(".ico")
                    )
                ) {

                    const archivo =
                        decodeURIComponent(
                            ruta.substring(1)
                        );


                    servirArchivo(
                        res,
                        archivo
                    );

                    return;

                }


                // ==========================================
                // ESTADO DEL SERVIDOR
                // ==========================================

                if (
                    req.method === "GET" &&
                    ruta === "/api/estado"
                ) {

                    responderJSON(
                        res,
                        200,
                        {
                            ok: true,

                            mensaje:
                                "Servidor funcionando correctamente.",

                            aplicacion:
                                "TU EMPLEO ES HOY"
                        }
                    );

                    return;

                }


                // ==========================================
                // REGISTRO
                // ==========================================

                if (
                    req.method === "POST" &&
                    ruta === "/api/registro"
                ) {

                    const datos =
                        await leerBody(req);


                    const nombre =
                        String(
                            datos.nombre || ""
                        ).trim();


                    const correo =
                        String(
                            datos.correo || ""
                        )
                        .trim()
                        .toLowerCase();


                    const contrasena =
                        String(
                            datos.contrasena || ""
                        );


                    const celular =
                        String(
                            datos.celular || ""
                        ).trim();


                    if (
                        !nombre ||
                        !correo ||
                        !contrasena ||
                        !celular
                    ) {

                        responderJSON(
                            res,
                            400,
                            {
                                ok: false,

                                mensaje:
                                    "Todos los campos son obligatorios."
                            }
                        );

                        return;

                    }


                    if (
                        contrasena.length < 6
                    ) {

                        responderJSON(
                            res,
                            400,
                            {
                                ok: false,

                                mensaje:
                                    "La contraseña debe tener al menos 6 caracteres."
                            }
                        );

                        return;

                    }


                    const usuarioExistente =
                        db.prepare(`

                            SELECT id

                            FROM users

                            WHERE correo = ?

                        `).get(
                            correo
                        );


                    if (
                        usuarioExistente
                    ) {

                        responderJSON(
                            res,
                            400,
                            {
                                ok: false,

                                mensaje:
                                    "Ese correo ya está registrado."
                            }
                        );

                        return;

                    }


                    const contrasenaHash =
                        hashPassword(contrasena);


                    const resultado =
                        db.prepare(`

                            INSERT INTO users
                            (
                                nombre,
                                correo,
                                contrasena,
                                celular
                            )

                            VALUES
                            (
                                ?,
                                ?,
                                ?,
                                ?
                            )

                        `).run(
                            nombre,
                            correo,
                            contrasenaHash,
                            celular
                        );


                    responderJSON(
                        res,
                        201,
                        {
                            ok: true,

                            mensaje:
                                "Registro realizado correctamente.",

                            usuario_id:
                                resultado.lastInsertRowid
                        }
                    );


                    return;

                }


                // ==========================================
                // SI LLEGAMOS AQUÍ, CONTINUAREMOS
                // CON LAS DEMÁS RUTAS EN LA PARTE 3
                // ==========================================
// ==========================================
// LOGIN
// ==========================================

if (
    req.method === "POST" &&
    ruta === "/api/login"
) {

    const datos =
        await leerBody(req);

    const correo =
        String(
            datos.correo || ""
        )
        .trim()
        .toLowerCase();

    const contrasena =
        String(
            datos.contrasena || ""
        );

    if (
        !correo ||
        !contrasena
    ) {

        responderJSON(
            res,
            400,
            {
                ok: false,
                mensaje:
                    "Debes escribir tu correo y contraseña."
            }
        );

        return;
    }


    const usuarioConPassword =
        db.prepare(`

            SELECT
                id,
                nombre,
                correo,
                celular,
                contrasena

            FROM users

            WHERE correo = ?

        `).get(
            correo
        );


    if (
        !usuarioConPassword ||
        !verificarPassword(
            contrasena,
            usuarioConPassword.contrasena
        )
    ) {

        responderJSON(
            res,
            401,
            {
                ok: false,
                mensaje:
                    "Correo o contraseña incorrectos."
            }
        );

        return;
    }


    // Migración de compatibilidad: si una cuenta antigua todavía
    // tenía la contraseña en texto plano, la convertimos al iniciar sesión.
    if (!usuarioConPassword.contrasena.startsWith("scrypt$")) {

        db.prepare(`
            UPDATE users
            SET contrasena = ?
            WHERE id = ?
        `).run(
            hashPassword(contrasena),
            usuarioConPassword.id
        );
    }


    const usuario = {
        id: usuarioConPassword.id,
        nombre: usuarioConPassword.nombre,
        correo: usuarioConPassword.correo,
        celular: usuarioConPassword.celular
    };


    const token =
        crearSesion(
            usuario.id
        );


    responderJSON(
        res,
        200,
        {
            ok: true,

            mensaje:
                "Inicio de sesión correcto.",

            usuario: usuario
        },

        [
            `session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${Math.floor(SESSION_MAX_AGE_MS / 1000)}${IS_PRODUCTION ? "; Secure" : ""}`
        ]
    );


    return;

}


// ==========================================
// CERRAR SESIÓN
// ==========================================

if (
    req.method === "POST" &&
    ruta === "/api/logout"
) {

    eliminarSesion(req);


    responderJSON(
        res,
        200,
        {
            ok: true,

            mensaje:
                "Sesión cerrada correctamente."
        },

        [
            "session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax"
        ]
    );


    return;

}


// ==========================================
// USUARIO ACTUAL
// ==========================================

if (
    req.method === "GET" &&
    ruta === "/api/me"
) {

    const usuario =
        obtenerUsuarioDesdeSesion(req);


    if (!usuario) {

        responderJSON(
            res,
            401,
            {
                ok: false,

                mensaje:
                    "Debes iniciar sesión."
            }
        );

        return;

    }


    responderJSON(
        res,
        200,
        {
            ok: true,

            usuario: usuario
        }
    );


    return;

}


// ==========================================
// PERFIL
// ==========================================

if (
    req.method === "GET" &&
    ruta === "/api/perfil"
) {

    const usuario =
        obtenerUsuarioDesdeSesion(req);


    if (!usuario) {

        responderJSON(
            res,
            401,
            {
                ok: false,

                mensaje:
                    "Debes iniciar sesión."
            }
        );

        return;

    }


    const curriculum =
        db.prepare(`

            SELECT
                id,
                nombre_archivo,
                fecha_subida

            FROM curriculums

            WHERE usuario_id = ?

            ORDER BY id DESC

            LIMIT 1

        `).get(
            usuario.id
        );


    responderJSON(
        res,
        200,
        {
            ok: true,

            usuario: usuario,

            curriculum:
                curriculum || null
        }
    );


    return;

}


// ==========================================
// SUBIR CURRÍCULUM
// ==========================================

if (
    req.method === "POST" &&
    ruta === "/api/curriculum"
) {

    const usuario =
        obtenerUsuarioDesdeSesion(req);


    if (!usuario) {

        responderJSON(
            res,
            401,
            {
                ok: false,

                mensaje:
                    "Debes iniciar sesión."
            }
        );

        return;

    }


    upload.single(
        "curriculum"
    )(
        req,
        res,
        function(error) {

            if (error) {

                console.error(
                    "Error al subir currículum:",
                    error.message
                );


                responderJSON(
                    res,
                    400,
                    {
                        ok: false,

                        mensaje:
                            error.message ||
                            "No se pudo subir el currículum."
                    }
                );


                return;

            }


            if (!req.file) {

                responderJSON(
                    res,
                    400,
                    {
                        ok: false,

                        mensaje:
                            "Debes seleccionar un currículum."
                    }
                );


                return;

            }


            try {

                // Buscar currículum anterior

                const anteriores =
                    db.prepare(`

                        SELECT
                            archivo_guardado

                        FROM curriculums

                        WHERE usuario_id = ?

                    `).all(
                        usuario.id
                    );


                // Eliminar archivos anteriores

                for (
                    const archivo
                    of anteriores
                ) {

                    const rutaAnterior =
                        path.join(
                            CURRICULUMS,
                            archivo.archivo_guardado
                        );


                    if (
                        fs.existsSync(
                            rutaAnterior
                        )
                    ) {

                        fs.unlinkSync(
                            rutaAnterior
                        );

                    }

                }


                // Eliminar registros anteriores

                db.prepare(`

                    DELETE FROM curriculums

                    WHERE usuario_id = ?

                `).run(
                    usuario.id
                );


                // Guardar nuevo currículum

                db.prepare(`

                    INSERT INTO curriculums
                    (
                        usuario_id,
                        nombre_archivo,
                        archivo_guardado
                    )

                    VALUES
                    (
                        ?,
                        ?,
                        ?
                    )

                `).run(
                    usuario.id,
                    req.file.originalname,
                    req.file.filename
                );


                responderJSON(
                    res,
                    201,
                    {
                        ok: true,

                        mensaje:
                            "Currículum subido correctamente.",

                        archivo:
                            req.file.originalname
                    }
                );


            } catch (errorBaseDatos) {

                console.error(
                    "Error guardando currículum:",
                    errorBaseDatos
                );


                if (
                    req.file &&
                    req.file.path &&
                    fs.existsSync(
                        req.file.path
                    )
                ) {

                    fs.unlinkSync(
                        req.file.path
                    );

                }


                responderJSON(
                    res,
                    500,
                    {
                        ok: false,

                        mensaje:
                            "No se pudo guardar el currículum."
                    }
                );

            }

        }
    );


    return;

}// ==========================================
// LISTAR OFERTAS
// ==========================================

if (
    req.method === "GET" &&
    ruta === "/api/ofertas"
) {

    const ofertas = db.prepare(`

        SELECT
            id,
            titulo,
            empresa,
            ubicacion,
            descripcion,
            salario,
            fecha_publicacion

        FROM ofertas

        ORDER BY id DESC

    `).all();


    responderJSON(
        res,
        200,
        {
            ok: true,
            ofertas: ofertas
        }
    );


    return;
}


// ==========================================
// CREAR OFERTA
// ==========================================

if (
    req.method === "POST" &&
    ruta === "/api/ofertas"
) {

    const usuario =
        obtenerUsuarioDesdeSesion(req);


    if (!usuario) {

        responderJSON(
            res,
            401,
            {
                ok: false,
                mensaje:
                    "Debes iniciar sesión."
            }
        );

        return;
    }


    const datos =
        await leerBody(req);


    const titulo =
        String(
            datos.titulo || ""
        ).trim();


    const empresa =
        String(
            datos.empresa || ""
        ).trim();


    const ubicacion =
        String(
            datos.ubicacion || ""
        ).trim();


    const descripcion =
        String(
            datos.descripcion || ""
        ).trim();


    const salario =
        String(
            datos.salario || ""
        ).trim();


    if (
        !titulo ||
        !empresa ||
        !ubicacion ||
        !descripcion
    ) {

        responderJSON(
            res,
            400,
            {
                ok: false,
                mensaje:
                    "Completa todos los campos obligatorios."
            }
        );

        return;
    }


    const resultado =
        db.prepare(`

            INSERT INTO ofertas
            (
                titulo,
                empresa,
                ubicacion,
                descripcion,
                salario
            )

            VALUES
            (
                ?,
                ?,
                ?,
                ?,
                ?
            )

        `).run(
            titulo,
            empresa,
            ubicacion,
            descripcion,
            salario
        );


    responderJSON(
        res,
        201,
        {
            ok: true,

            mensaje:
                "Oferta publicada correctamente.",

            oferta_id:
                resultado.lastInsertRowid
        }
    );


    return;
}


// ==========================================
// APLICAR A UNA OFERTA
// ==========================================

if (
    req.method === "POST" &&
    ruta === "/api/postulaciones"
) {

    const usuario =
        obtenerUsuarioDesdeSesion(req);


    if (!usuario) {

        responderJSON(
            res,
            401,
            {
                ok: false,

                mensaje:
                    "Debes iniciar sesión."
            }
        );

        return;
    }


    // Verificar currículum

    const curriculum =
        db.prepare(`

            SELECT id

            FROM curriculums

            WHERE usuario_id = ?

            LIMIT 1

        `).get(
            usuario.id
        );


    if (!curriculum) {

        responderJSON(
            res,
            400,
            {
                ok: false,

                mensaje:
                    "Debes subir tu currículum antes de aplicar."
            }
        );

        return;
    }


    const datos =
        await leerBody(req);


    const ofertaId =
        Number(
            datos.oferta_id
        );


    if (
        !Number.isInteger(
            ofertaId
        ) ||
        ofertaId <= 0
    ) {

        responderJSON(
            res,
            400,
            {
                ok: false,

                mensaje:
                    "Oferta no válida."
            }
        );

        return;
    }


    // Verificar oferta

    const oferta =
        db.prepare(`

            SELECT id

            FROM ofertas

            WHERE id = ?

        `).get(
            ofertaId
        );


    if (!oferta) {

        responderJSON(
            res,
            404,
            {
                ok: false,

                mensaje:
                    "La oferta no existe."
            }
        );

        return;
    }


    // Verificar si ya aplicó

    const yaAplico =
        db.prepare(`

            SELECT id

            FROM postulaciones

            WHERE usuario_id = ?

            AND oferta_id = ?

        `).get(
            usuario.id,
            ofertaId
        );


    if (yaAplico) {

        responderJSON(
            res,
            400,
            {
                ok: false,

                mensaje:
                    "Ya aplicaste a esta oferta."
            }
        );

        return;
    }


    const resultado =
        db.prepare(`

            INSERT INTO postulaciones
            (
                usuario_id,
                oferta_id
            )

            VALUES
            (
                ?,
                ?
            )

        `).run(
            usuario.id,
            ofertaId
        );


    responderJSON(
        res,
        201,
        {
            ok: true,

            mensaje:
                "¡Aplicación enviada correctamente!",

            postulacion_id:
                resultado.lastInsertRowid
        }
    );


    return;
}


// ==========================================
// MIS POSTULACIONES
// ==========================================

if (
    req.method === "GET" &&
    ruta === "/api/mis-postulaciones"
) {

    const usuario =
        obtenerUsuarioDesdeSesion(req);


    if (!usuario) {

        responderJSON(
            res,
            401,
            {
                ok: false,

                mensaje:
                    "Debes iniciar sesión."
            }
        );

        return;
    }


    const postulaciones =
        db.prepare(`

            SELECT

                postulaciones.id,

                postulaciones.fecha_postulacion,

                ofertas.titulo,

                ofertas.empresa,

                ofertas.ubicacion,

                ofertas.salario

            FROM postulaciones

            INNER JOIN ofertas

                ON ofertas.id =
                postulaciones.oferta_id

            WHERE
                postulaciones.usuario_id = ?

            ORDER BY
                postulaciones.id DESC

        `).all(
            usuario.id
        );


    responderJSON(
        res,
        200,
        {
            ok: true,

            postulaciones:
                postulaciones
        }
    );


    return;
}


// ==========================================
// LISTAR POSTULANTES
// ==========================================

if (
    req.method === "GET" &&
    ruta === "/api/postulantes"
) {

    const usuario =
        obtenerUsuarioDesdeSesion(req);


    if (!usuario) {

        responderJSON(
            res,
            401,
            {
                ok: false,

                mensaje:
                    "Debes iniciar sesión."
            }
        );

        return;
    }

    if (!ADMIN_EMAILS.has(usuario.correo.toLowerCase())) {

        responderJSON(
            res,
            403,
            {
                ok: false,
                mensaje:
                    "No tienes permisos para consultar los postulantes."
            }
        );

        return;
    }


    const postulantes =
        db.prepare(`

            SELECT

                postulaciones.id,

                postulaciones.fecha_postulacion,

                users.nombre,

                users.correo,

                users.celular,

                ofertas.titulo AS oferta,

                ofertas.empresa

            FROM postulaciones

            INNER JOIN users

                ON users.id =
                postulaciones.usuario_id

            INNER JOIN ofertas

                ON ofertas.id =
                postulaciones.oferta_id

            ORDER BY
                postulaciones.id DESC

        `).all();


    responderJSON(
        res,
        200,
        {
            ok: true,

            postulantes:
                postulantes
        }
    );


    return;
}// ==========================================
// RUTA NO ENCONTRADA
// ==========================================

responderJSON(
    res,
    404,
    {
        ok: false,
        mensaje: "Ruta no encontrada.",
        ruta: ruta
    }
);


// ==========================================
// FIN DEL TRY
// ==========================================

} catch (error) {

    console.error(
        "ERROR DEL SERVIDOR:",
        error
    );


    responderJSON(
        res,
        500,
        {
            ok: false,

            mensaje:
                "Error interno del servidor.",

            ...(IS_PRODUCTION
                ? {}
                : { detalle: error.message })
        }
    );

}

});


// ==========================================
// ERRORES DEL PUERTO / SERVIDOR
// ==========================================

server.on("error", error => {

    if (error.code === "EADDRINUSE") {

        console.error(
            `El puerto ${PORT} ya está en uso. Cierra el proceso anterior o configura otro PORT.`
        );

    } else {

        console.error(
            "Error al iniciar el servidor:",
            error
        );

    }

    process.exitCode = 1;

});


// ==========================================
// INICIAR SERVIDOR
// ==========================================

server.listen(
    PORT,
    () => {

        console.log("");

        console.log(
            "=============================================="
        );

        console.log(
            "       TU EMPLEO ES HOY"
        );

        console.log(
            "=============================================="
        );

        console.log(
            `Servidor funcionando en: http://localhost:${PORT}`
        );

        console.log(
            "Base de datos: database/app.db"
        );

        console.log(
            "=============================================="
        );

        console.log("");

    }
);


// ==========================================
// CIERRE LIMPIO DEL SERVIDOR
// ==========================================

process.on(
    "SIGINT",
    () => {

        try {

            db.close();

        } finally {

            process.exit(0);

        }

    }
);


process.on(
    "SIGTERM",
    () => {

        try {

            db.close();

        } finally {

            process.exit(0);

        }

    }
);