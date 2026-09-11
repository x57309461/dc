export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const corsHeaders = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS, DELETE",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
        };

        if (request.method === "OPTIONS") {
            return new Response(null, { headers: corsHeaders });
        }

        const json = (data, status = 200) =>
            new Response(JSON.stringify(data), {
                status,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });

        // ===== 注册 =====
        if (url.pathname === "/register" && request.method === "POST") {
            try {
                const { username, password } = await request.json();
                if (!username || !password) return json({ error: "用户名和密码不能为空" }, 400);
                if (username.length < 2) return json({ error: "用户名至少 2 个字符" }, 400);
                if (password.length < 4) return json({ error: "密码至少 4 个字符" }, 400);

                const existing = await env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(username).first();
                if (existing) return json({ error: "用户名已被使用" }, 409);

                const salt = generateSalt();
                const hash = await hashPassword(password, salt);
                const result = await env.DB.prepare(
                    "INSERT INTO users (username, password_hash, salt, created_at) VALUES (?, ?, ?, ?)"
                ).bind(username, hash, salt, Date.now()).run();
                const userId = result.meta.last_row_id;

                // 复制公共词库给新用户
                await env.DB.prepare(
                    "INSERT INTO words (user_id, level, word, phonetic, definition, example) " +
                    "SELECT ?, level, word, phonetic, definition, example FROM words WHERE user_id = 0"
                ).bind(userId).run();

                const token = generateToken();
                await env.DB.prepare(
                    "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)"
                ).bind(token, userId, Date.now() + 30 * 24 * 3600 * 1000).run();

                return json({ token, username });
            } catch (e) {
                return json({ error: e.message }, 500);
            }
        }

        // ===== 登录 =====
        if (url.pathname === "/login" && request.method === "POST") {
            try {
                const { username, password } = await request.json();
                const user = await env.DB.prepare("SELECT * FROM users WHERE username = ?").bind(username).first();
                if (!user) return json({ error: "用户名或密码错误" }, 401);
                const hash = await hashPassword(password, user.salt);
                if (hash !== user.password_hash) return json({ error: "用户名或密码错误" }, 401);

                const token = generateToken();
                await env.DB.prepare(
                    "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)"
                ).bind(token, user.id, Date.now() + 30 * 24 * 3600 * 1000).run();

                return json({ token, username: user.username });
            } catch (e) {
                return json({ error: e.message }, 500);
            }
        }

        // ===== 下面接口需要登录 =====
        const userId = await authenticate(request, env);

        if (url.pathname === "/me" && request.method === "GET") {
            if (!userId) return json({ error: "未登录" }, 401);
            const user = await env.DB.prepare("SELECT id, username FROM users WHERE id = ?").bind(userId).first();
            return json(user);
        }

        if (url.pathname === "/logout" && request.method === "POST") {
            const auth = request.headers.get("Authorization") || "";
            const token = auth.replace(/^Bearer\s+/i, "");
            if (token) await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
            return json({ success: true });
        }

        // ===== GET /words?level=xxx =====
        if (url.pathname === "/words" && request.method === "GET") {
            if (!userId) return json({ error: "未登录" }, 401);
            const level = url.searchParams.get("level");
            try {
                let stmt;
                if (level) {
                    stmt = env.DB.prepare(
                        "SELECT id, level, word, phonetic, definition, example FROM words WHERE user_id = ? AND level = ? ORDER BY id"
                    ).bind(userId, level);
                } else {
                    stmt = env.DB.prepare(
                        "SELECT id, level, word, phonetic, definition, example FROM words WHERE user_id = ? ORDER BY id"
                    ).bind(userId);
                }
                const { results } = await stmt.all();
                return json(results);
            } catch (e) {
                return json({ error: e.message }, 500);
            }
        }

        // ===== POST /words =====
        if (url.pathname === "/words" && request.method === "POST") {
            if (!userId) return json({ error: "未登录" }, 401);
            try {
                const { level, word, phonetic, definition, example } = await request.json();
                if (!word || !definition) return json({ error: "单词和释义不能为空" }, 400);
                await env.DB.prepare(
                    "INSERT INTO words (user_id, level, word, phonetic, definition, example) VALUES (?, ?, ?, ?, ?, ?)"
                ).bind(userId, level || "primary", word, phonetic || "", definition, example || "").run();
                return json({ success: true });
            } catch (e) {
                return json({ error: e.message }, 500);
            }
        }

        // ===== DELETE /words?id=xxx =====
        if (url.pathname === "/words" && request.method === "DELETE") {
            if (!userId) return json({ error: "未登录" }, 401);
            const id = url.searchParams.get("id");
            if (!id) return json({ error: "缺少 id" }, 400);
            await env.DB.prepare("DELETE FROM words WHERE id = ? AND user_id = ?").bind(id, userId).run();
            return json({ success: true });
        }

        return new Response("Not Found", { status: 404, headers: corsHeaders });
    },
};

// ===== 工具函数 =====
function generateSalt() {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    return [...arr].map(b => b.toString(16).padStart(2, "0")).join("");
}

function generateToken() {
    const arr = new Uint8Array(32);
    crypto.getRandomValues(arr);
    return [...arr].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function hashPassword(password, salt) {
    const data = new TextEncoder().encode(salt + password);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(hashBuffer)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function authenticate(request, env) {
    const auth = request.headers.get("Authorization") || "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (!token) return null;
    const session = await env.DB.prepare(
        "SELECT user_id, expires_at FROM sessions WHERE token = ?"
    ).bind(token).first();
    if (!session) return null;
    if (session.expires_at < Date.now()) {
        await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
        return null;
    }
    return session.user_id;
}