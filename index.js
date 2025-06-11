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

// Cria tabelas se não existirem (NÃO usa nascimento)
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
    servico TEXT,
    datahora TEXT,
    funcionaria TEXT,
    status TEXT DEFAULT 'pendente'
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT,
    telefone TEXT,
    cpf TEXT UNIQUE
  )`);

  db.run(
    `INSERT OR IGNORE INTO users (username, password) VALUES 
      ('marcones', '1234'),
      ('analaura', '5678'),
      ('luiza', '9999')
    `
  );

  db.run(`CREATE TABLE IF NOT EXISTS servicos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT UNIQUE,
    preco REAL
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS funcionarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT,
    cargo TEXT,
    status TEXT DEFAULT 'Ativo'
  )`);
  
  


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

// Painel de agendamentos — agora busca os serviços!
app.get("/dashboard", (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  const filtro = req.query.filtro || "todos";
  let sql = "SELECT * FROM agendamentos";
  let params = [];

  if (filtro === "dia") {
    sql += " WHERE date(datahora) = date('now', 'localtime')";
  } else if (filtro === "semana") {
    sql += " WHERE date(datahora) >= date('now', '-6 days', 'localtime')";
  } else if (filtro === "mes") {
    sql += " WHERE strftime('%Y-%m', datahora) = strftime('%Y-%m', 'now', 'localtime')";
  }
  sql += " ORDER BY datahora";

  db.all(sql, params, (err, agendamentos) => {
    db.all("SELECT * FROM servicos ORDER BY nome", [], (err2, servicos) => {
      db.all("SELECT * FROM funcionarios WHERE status = 'Ativo' ORDER BY nome", [], (err3, funcionarios) => {
        // Sempre manda funcionários para o EJS!
        res.render("dashboard", {
          user: req.session.user,
          agendamentos: err ? [] : agendamentos,
          servicos: err2 ? [] : servicos,
          funcionarios: err3 ? [] : funcionarios,
          filtro,
          error: err ? "Erro ao buscar agendamentos." : null,
          success: null,
        });
      });
    });
  });
});



// Cadastro de agendamento
app.post("/agendar", (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  let { cliente, telefone, cpf, servico, datahora, funcionaria } = req.body;

  cpf = cpf.replace(/[^\d]/g, "");

  if (!cliente || !telefone || !cpf || !servico || !datahora || !funcionaria) {
    return res.redirect("/dashboard?error=Preencha todos os campos");
  }

  // Cadastra o cliente sem nascimento
  db.run(
    "INSERT OR IGNORE INTO clientes (nome, telefone, cpf) VALUES (?, ?, ?)",
    [cliente, telefone, cpf],
    function (err) {
      if (err) {
        console.log("Erro ao inserir cliente:", err);
      }
      // Agora cadastra o agendamento sem nascimento
      db.run(
        "INSERT INTO agendamentos (cliente, telefone, cpf, servico, datahora, funcionaria) VALUES (?, ?, ?, ?, ?, ?)",
        [cliente, telefone, cpf, servico, datahora, funcionaria],
        function (err) {
          if (err) {
            console.log("Erro ao agendar:", err);
            return res.redirect("/dashboard?error=Erro ao agendar");
          }
          res.redirect("/dashboard?success=Agendamento realizado!");
        }
      );
    }
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

// Rota para autocomplete de clientes (usada pelo dashboard.ejs)
app.get('/clientes/autocomplete', (req, res) => {
  const termo = (req.query.q || '').trim();
  if (termo.length < 2) return res.json([]);
  db.all(
    "SELECT * FROM clientes WHERE nome LIKE ? LIMIT 10",
    [`%${termo}%`],
    (err, rows) => {
      if (err) return res.json([]);
      res.json(rows);
    }
  );
});

// Página de consulta de clientes
app.get("/clientes", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  db.all("SELECT * FROM clientes ORDER BY nome", [], (err, clientes) => {
    if (err) {
      return res.render("clientes", { clientes: [], error: "Erro ao buscar clientes." });
    }
    res.render("clientes", { clientes, error: null });
  });
});

// Página de consulta do horário do cliente (GET)
app.get("/meuhorario", (req, res) => {
  res.render("meuhorario", {
    horarios: null,
    cpf: "",
    error: null,
  });
});

// Consulta do horário do cliente (POST)
app.post("/meuhorario", (req, res) => {
  let { cpf } = req.body;
  cpf = cpf.replace(/[^\d]/g, "");

  db.all(
    "SELECT * FROM agendamentos WHERE cpf = ? ORDER BY datahora",
    [cpf],
    (err, rows) => {
      if (err) {
        return res.render("meuhorario", {
          horarios: null,
          cpf,
          error: "Erro ao buscar agendamentos.",
        });
      }
      if (!rows || rows.length === 0) {
        return res.render("meuhorario", {
          horarios: null,
          cpf,
          error: "Nenhum horário encontrado para esse CPF.",
        });
      }
      res.render("meuhorario", {
        horarios: rows,
        cpf,
        error: null,
      });
    }
  );
});

// Página para listar e cadastrar serviços
app.get("/servicos", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  db.all("SELECT * FROM servicos ORDER BY nome", [], (err, servicos) => {
    if (err) {
      return res.render("servicos", { servicos: [], error: "Erro ao buscar serviços." });
    }
    res.render("servicos", { servicos, error: null });
  });
});

// Cadastro de novo serviço (POST)
app.post("/servicos", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  const { nome, preco } = req.body;
  if (!nome || !preco) {
    return res.redirect("/servicos?error=Preencha todos os campos");
  }
  db.run(
    "INSERT INTO servicos (nome, preco) VALUES (?, ?)",
    [nome, preco],
    function (err) {
      if (err) {
        return res.redirect("/servicos?error=Erro ao cadastrar serviço (já existe ou dados inválidos)");
      }
      res.redirect("/servicos");
    }
  );
});

app.get('/relatorio', (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  const { cliente } = req.query;
  let sql = "SELECT * FROM agendamentos";
  let params = [];

  if (cliente && cliente.trim() !== "") {
    sql += " WHERE cliente LIKE ?";
    params.push(`%${cliente}%`);
  }

  sql += " ORDER BY datahora";

  db.all(sql, params, (err, agendamentos) => {
    if (err) return res.render("relatorio", { agendamentos: [], clienteBusca: cliente || "", servicos: [] });

    // Buscar os serviços para mostrar valor no relatório
    db.all("SELECT * FROM servicos", [], (err2, servicos) => {
      if (err2) servicos = [];
      res.render("relatorio", { agendamentos, clienteBusca: cliente || "", servicos });
    });
  });
});

// Listar funcionários
app.get("/funcionarios", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  db.all("SELECT * FROM funcionarios ORDER BY nome", [], (err, funcionarios) => {
    if (err) {
      return res.render("funcionarios", { funcionarios: [], error: "Erro ao buscar funcionários." });
    }
    res.render("funcionarios", { funcionarios, error: null });
  });
});

// Cadastrar funcionário
app.post("/funcionarios", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  const { nome, cargo } = req.body;
  if (!nome) {
    // Busca os funcionários para mostrar o erro
    db.all("SELECT * FROM funcionarios ORDER BY nome", [], (err, funcionarios) => {
      return res.render("funcionarios", { funcionarios, error: "Nome é obrigatório." });
    });
    return;
  }
  db.run(
    "INSERT INTO funcionarios (nome, cargo, status) VALUES (?, ?, ?)",
    [nome, cargo || '', 'Ativo'],
    function (err) {
      if (err) {
        db.all("SELECT * FROM funcionarios ORDER BY nome", [], (err2, funcionarios) => {
          return res.render("funcionarios", { funcionarios, error: "Erro ao cadastrar funcionário." });
        });
        return;
      }
      res.redirect("/funcionarios");
    }
  );
});

app.post("/funcionarios/status/:id", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  const id = req.params.id;
  const { status } = req.body;
  db.run(
    "UPDATE funcionarios SET status = ? WHERE id = ?",
    [status, id],
    function (err) {
      if (err) {
        // Se quiser, pode passar o erro na tela
        return res.redirect("/funcionarios?error=Erro ao atualizar status");
      }
      res.redirect("/funcionarios");
    }
  );
});

// Editar funcionário
app.post("/funcionarios/edit/:id", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  const id = req.params.id;
  const { nome, cargo } = req.body;
  db.run(
    "UPDATE funcionarios SET nome = ?, cargo = ? WHERE id = ?",
    [nome, cargo, id],
    function (err) {
      if (err) {
        return res.redirect("/funcionarios?error=Erro ao editar funcionário");
      }
      res.redirect("/funcionarios");
    }
  );
});

// Excluir funcionário
app.post("/funcionarios/delete/:id", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  const id = req.params.id;
  db.run(
    "DELETE FROM funcionarios WHERE id = ?",
    [id],
    function (err) {
      if (err) {
        return res.redirect("/funcionarios?error=Erro ao excluir funcionário");
      }
      res.redirect("/funcionarios");
    }
  );
});

// Atualizar status do agendamento
app.post('/atualizar-status/:id', (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  const id = req.params.id;
  const { status } = req.body;
  db.run(
    "UPDATE agendamentos SET status = ? WHERE id = ?",
    [status, id],
    function (err) {
      if (err) {
        return res.redirect("/dashboard?error=Erro ao atualizar status");
      }
      res.redirect("/dashboard");
    }
  );
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Rodando na porta ${PORT}`);
});
