const express = require("express");
const session = require("express-session");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const app = express();
const db = new sqlite3.Database("./users.db");

// Configura Express
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Cria tabelas se não existirem
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS agendamentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente TEXT,
    telefone TEXT,
    cpf TEXT,
    nascimento TEXT,
    servico TEXT,
    datahora TEXT,
    funcionaria TEXT
  )`);

  // Usuários fixos
  db.run(
    `INSERT OR IGNORE INTO users (username, password) VALUES 
      ('marcones', '1234'),
      ('analaura', '5678'),
      ('luiza', '9999')
    `,
  );
});

// SESSÃO
app.use(
  session({
    secret: "salão-top-secreto",
    resave: false,
    saveUninitialized: false,
  }),
);

// Tela de login
app.get("/login", (req, res) => {
  res.render("login", { error: null });
});

app.post("/login", (req, res) => {
  const { username, password } = req.body;
  db.get(
    "SELECT * FROM users WHERE username = ? AND password = ?",
    [username, password],
    (err, user) => {
      if (user) {
        req.session.user = user.username;
        res.redirect("/dashboard");
      } else {
        res.render("login", { error: "Usuário ou senha inválidos" });
      }
    },
  );
});

// Rota para página de cadastro (GET)
app.get("/register", (req, res) => {
  res.render("register", { error: null, success: null });
});

// Rota para criar novo usuário (POST)
app.post("/register", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.render("register", {
      error: "Preencha todos os campos",
      success: null,
    });
  }
  db.run(
    "INSERT INTO users (username, password) VALUES (?, ?)",
    [username, password],
    function (err) {
      if (err) {
        return res.render("register", {
          error: "Usuário já existe",
          success: null,
        });
      }
      res.render("register", {
        error: null,
        success: "Usuário cadastrado com sucesso!",
      });
    },
  );
});

// Painel de agendamentos
app.get("/dashboard", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  db.all(
    "SELECT * FROM agendamentos ORDER BY datahora",
    [],
    (err, agendamentos) => {
      res.render("dashboard", {
        user: req.session.user,
        agendamentos: agendamentos,
        error: null,
        success: null,
      });
    },
  );
});

// Cadastro de agendamento (tratamento do CPF incluído)
app.post("/agendar", (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  let { cliente, telefone, cpf, nascimento, servico, datahora, funcionaria } =
    req.body;

  // Remove máscara do CPF
  cpf = cpf.replace(/[^\d]/g, "");

  if (
    !cliente ||
    !telefone ||
    !cpf ||
    !nascimento ||
    !servico ||
    !datahora ||
    !funcionaria
  ) {
    return res.redirect("/dashboard?error=Preencha todos os campos");
  }

  db.run(
    "INSERT INTO agendamentos (cliente, telefone, cpf, nascimento, servico, datahora, funcionaria) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [cliente, telefone, cpf, nascimento, servico, datahora, funcionaria],
    function (err) {
      if (err) {
        return res.redirect("/dashboard?error=Erro ao agendar");
      }
      res.redirect("/dashboard?success=Agendamento realizado!");
    },
  );
});

// Apagar agendamento
app.post("/apagar/:id", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  db.run(
    "DELETE FROM agendamentos WHERE id = ?",
    [req.params.id],
    function (err) {
      res.redirect("/dashboard");
    },
  );
});

// Logout
app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

// Página inicial redireciona para login
app.get("/", (req, res) => res.redirect("/login"));

// Consulta do cliente por CPF e Nascimento
app.get("/meuhorario", (req, res) => {
  res.render("meuhorario", {
    horarios: null,
    cpf: "",
    nascimento: "",
    error: null,
  });
});

app.post("/meuhorario", (req, res) => {
  let { cpf, nascimento } = req.body;

  // Remove máscara aqui também
  cpf = cpf.replace(/[^\d]/g, "");

  db.all(
    "SELECT * FROM agendamentos WHERE cpf = ? AND nascimento = ?",
    [cpf, nascimento],
    (err, rows) => {
      if (err) {
        return res.render("meuhorario", {
          horarios: null,
          cpf,
          nascimento,
          error: "Erro ao buscar agendamentos.",
        });
      }
      if (!rows || rows.length === 0) {
        return res.render("meuhorario", {
          horarios: null,
          cpf,
          nascimento,
          error: "Nenhum horário encontrado para esses dados.",
        });
      }
      res.render("meuhorario", {
        horarios: rows,
        cpf,
        nascimento,
        error: null,
      });
    },
  );
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Rodando na porta ${PORT}`);
});
