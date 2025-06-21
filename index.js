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



// Função para remover acentos e deixar minúsculo
function normalize(str) {
  return str
    ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    : "";
}
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
    status TEXT DEFAULT 'pendente',
    valor REAL,
    valor_pago REAL,
    status_pagto TEXT DEFAULT 'nao_pago'
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
  let sql = `
  SELECT a.*,
         IFNULL(SUM(p.valor_pago), 0) AS valor_pago,
         a.valor - IFNULL(SUM(p.valor_pago), 0) AS valor_restante
  FROM agendamentos a
  LEFT JOIN pagamentos p ON a.id = p.agendamento_id
`;
  let params = [];

  if (filtro === "dia") {
    sql += " WHERE date(datahora) = date('now', 'localtime')";
  } else if (filtro === "semana") {
    sql += " WHERE date(datahora) >= date('now', '-6 days', 'localtime')";
  } else if (filtro === "mes") {
    sql += " WHERE strftime('%Y-%m', datahora) = strftime('%Y-%m', 'now', 'localtime')";
  }
   sql += " GROUP BY a.id ORDER BY datahora";

  db.all(sql, params, (err, agendamentos) => {
    db.all("SELECT * FROM servicos ORDER BY nome", [], (err2, servicos) => {
      db.all("SELECT * FROM funcionarios WHERE status = 'Ativo' ORDER BY nome", [], (err3, funcionarios) => {
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

  let { cliente, telefone, cpf, servico, datahora, funcionaria, valor, valor_pago } = req.body;

  cpf = cpf.replace(/[^\d]/g, "");

  if (!cliente || !telefone || !cpf || !servico || !datahora || !funcionaria) {
    return res.redirect("/dashboard?error=Preencha todos os campos");
  }

  db.run(
    "INSERT OR IGNORE INTO clientes (nome, telefone, cpf) VALUES (?, ?, ?)",
    [cliente, telefone, cpf],
    function (err) {
      if (err) {
        console.log("Erro ao inserir cliente:", err);
      }
      db.run(
        "INSERT INTO agendamentos (cliente, telefone, cpf, servico, datahora, funcionaria, valor, valor_pago) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [cliente, telefone, cpf, servico, datahora, funcionaria, valor || null, valor_pago || null],
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

app.get("/clientes", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  const { busca, status } = req.query;

  let where = [];
  let params = [];

  if (typeof status !== 'undefined' && status !== '' && (status === '1' || status === '0')) {
    where.push('ativo = ?');
    params.push(Number(status));
  }
  if (busca && busca.trim()) {
    where.push('(nome LIKE ? OR telefone LIKE ? OR cpf LIKE ?)');
    params.push(`%${busca}%`, `%${busca}%`, `%${busca}%`);
  }
  const sql = `SELECT * FROM clientes${where.length ? ' WHERE ' + where.join(' AND ') : ''} ORDER BY nome`;
  db.all(sql, params, (err, clientes) => {
    if (err) {
      return res.render("clientes", { clientes: [], error: "Erro ao buscar clientes.", query: req.query });
    }
    res.render("clientes", { clientes, error: null, query: req.query });
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

app.post('/atualizar-status-pagto/:id', (req, res) => {
  const id = req.params.id;
  const novoStatus = req.body.status_pagto;

  db.run("UPDATE agendamentos SET status_pagto = ? WHERE id = ?", [novoStatus, id], (err) => {
    if (err) {
      console.error(err);
      return res.status(500).send("Erro ao atualizar status de pagamento");
    }
    res.redirect('/dashboard'); // redireciona para atualizar a tabela
  });
});

app.post('/atualizar-pago/:id', (req, res) => {
  if (!req.session.user) return res.status(401).send('Não autorizado');

  const id = req.params.id;
  // Como o checkbox envia "true" ou "false" como string, convertemos para número 1 ou 0
  const foiPago = req.body.foi_pago === 'true' ? 1 : 0;

  // Atualize o campo correto na tabela agendamentos (status_pagto ou outro)
  // Aqui suponho que você tenha uma coluna 'foi_pago' do tipo INTEGER (0 ou 1)
  // Caso use status_pagto, adapte o valor para 'sim' ou 'nao_pago' conforme lógica

  db.run(
    "UPDATE agendamentos SET foi_pago = ? WHERE id = ?",
    [foiPago, id],
    function (err) {
      if (err) {
        console.error("Erro ao atualizar status de pagamento:", err);
        return res.status(500).send("Erro ao atualizar status de pagamento");
      }
      res.sendStatus(200);
    }
  );
});
db.run(`CREATE TABLE IF NOT EXISTS pagamentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agendamento_id INTEGER NOT NULL,
  valor_pago REAL NOT NULL,
  data_pagamento TEXT DEFAULT CURRENT_TIMESTAMP,
  forma_pagamento TEXT,
  observacao TEXT,
  FOREIGN KEY (agendamento_id) REFERENCES agendamentos(id) ON DELETE CASCADE
)`);

// Registrar novo pagamento
app.post("/pagamento", (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  const { agendamento_id, valor_pago, forma_pagamento, observacao } = req.body;

  if (!valor_pago || isNaN(valor_pago)) {
    return res.redirect("/dashboard?error=Valor inválido");
  }

  db.run(
    `INSERT INTO pagamentos (agendamento_id, valor_pago, forma_pagamento, observacao)
     VALUES (?, ?, ?, ?)`,
    [agendamento_id, valor_pago, forma_pagamento || null, observacao || null],
    function (err) {
      if (err) {
        console.error("Erro ao registrar pagamento:", err);
        return res.redirect("/dashboard?error=Erro ao salvar pagamento");
      }

      res.redirect("/dashboard?success=Pagamento registrado com sucesso!");
    }
  );
});


/* ------------------------------------------------------------
   PAGAMENTOS – usado pelo botão “+ Pagamento”
   ------------------------------------------------------------ */
   app.post("/pagamentos/:id", (req, res) => {
    if (!req.session.user) return res.redirect("/login");
  
    const agendamentoId = req.params.id;
    const valorPago     = parseFloat(req.body.valorPago);
  
    if (!valorPago || isNaN(valorPago) || valorPago <= 0)
      return res.redirect("/dashboard?error=Valor inválido");
  
    // 1) grava o pagamento na tabela pagamentos
    db.run(
      "INSERT INTO pagamentos (agendamento_id, valor_pago) VALUES (?, ?)",
      [agendamentoId, valorPago],
      (err) => {
        if (err) return res.redirect("/dashboard?error=Erro ao salvar pagamento");
  
        // 2) calcula a soma para saber se quitou
        db.get(`
          SELECT a.valor,
                 IFNULL(SUM(p.valor_pago), 0) AS totalPago
            FROM agendamentos a
       LEFT JOIN pagamentos p ON p.agendamento_id = a.id
           WHERE a.id = ?
        GROUP BY a.id`,
          [agendamentoId],
          (_e, row) => {
            const novoStatus =
              row && row.totalPago >= row.valor ? "pago" : "nao_pago";
  
            db.run(
              "UPDATE agendamentos SET status_pagto = ? WHERE id = ?",
              [novoStatus, agendamentoId],
              () => res.redirect("/dashboard?success=Pagamento registrado!")
            );
          }
        );
      }
    );
  });

  app.get('/agendamentos', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: "Não autorizado" });
  
    const filtro = req.query.filtro || "todos";
  
    let sql = `
    SELECT a.*,
           IFNULL(SUM(p.valor_pago), 0) AS valor_pago,
           a.valor - IFNULL(SUM(p.valor_pago), 0) AS valor_restante
    FROM agendamentos a
    LEFT JOIN pagamentos p ON a.id = p.agendamento_id
    `;
    let params = [];
  
    if (filtro === "dia") {
      sql += " WHERE date(datahora) = date('now', 'localtime')";
    } else if (filtro === "semana") {
      sql += " WHERE date(datahora) >= date('now', '-6 days', 'localtime')";
    } else if (filtro === "mes") {
      sql += " WHERE strftime('%Y-%m', datahora) = strftime('%Y-%m', 'now', 'localtime')";
    }
    sql += " GROUP BY a.id ORDER BY datahora";
  
    db.all(sql, params, (err, agendamentos) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(agendamentos);
    });
  });
  

  app.get('/agenda', (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    db.all("SELECT nome FROM funcionarios WHERE status='Ativo' ORDER BY nome", [], (err, funcs) => {
      res.render('agenda', { user: req.session.user, funcs, query: req.query }); // <-- ESSA LINHA!
    });
  });
  
    

  app.get('/agenda/events', (req, res) => {
    if (!req.session.user) return res.status(401).json([]);
  
    const func = normalize(req.query.func || '');
  
    // Filtro SQL para remover acentos e minúsculas
    let where = '';
    let params = [];
    if (func) {
      where = `
        AND lower(
          replace(
            replace(
              replace(
                replace(
                  replace(
                    replace(
                      replace(
                        replace(
                          replace(
                            replace(
                              a.funcionaria,
                              'á','a'
                            ), 'à','a'
                          ), 'ã','a'
                        ), 'â','a'
                      ), 'ä','a'
                    ), 'é','e'
                  ), 'è','e'
                ), 'ê','e'
              ), 'ë','e'
            ), 'í','i'
          )
        ) = ?
      `;
      params = [func];
    }
  
    const sql = `
      SELECT a.id, a.cliente, a.servico, a.datahora,
             a.status, a.valor, a.funcionaria,
             IFNULL(SUM(p.valor_pago),0) AS pago
        FROM agendamentos a
   LEFT JOIN pagamentos p ON p.agendamento_id = a.id
       WHERE 1=1 ${where}
    GROUP BY a.id`;
  
    db.all(sql, params, (err, rows) => {
      if (err) return res.json([]);
  
      const eventos = rows.map(a => {
        const restante = (a.valor || 0) - (a.pago || 0);
  
        const cor =
          restante <= 0                 ? '#22c55e' :       // Pago
          a.status === 'compareceu'      ? '#0ea5e9' :       // Compareceu
          a.status === 'nao_compareceu'  ? '#ef4444' :       // Vencido (falta)
                                           '#facc15';        // Em aberto
  
        return {
          id:    a.id,
          title: `${a.cliente} – ${a.servico}`,
          start: a.datahora,
          backgroundColor: cor,
          borderColor:     cor,
          extendedProps: { status: a.status, restante }
        };
      });
  
      res.json(eventos);
    });
  });


// Buscar agendamentos de um dia específico para visualização em lista
app.get('/agenda/lista', (req, res) => {
  if (!req.session.user) return res.status(401).json([]);
  const dia = req.query.data; // formato 'YYYY-MM-DD'
  if (!dia) return res.json([]);
  db.all(
    `SELECT * FROM agendamentos WHERE date(datahora) = ? ORDER BY datahora`,
    [dia],
    (err, rows) => {
      if (err) return res.json([]);
      res.json(rows);
    }
  );
});


// Editar cliente (nome e telefone)
app.post('/clientes/editar/:id', express.json(), (req, res) => {
  const id = req.params.id;
  const { nome, telefone } = req.body;
  db.run("UPDATE clientes SET nome = ?, telefone = ? WHERE id = ?", [nome, telefone, id], err => {
    if (err) return res.status(500).json({ error: 'Erro ao editar.' });
    res.status(200).json({ ok: true });
  });
});

// Inativar cliente (define um campo 'ativo' = 0, precisa criar no banco se ainda não existe)
app.post('/clientes/inativar/:id', (req, res) => {
  db.run("UPDATE clientes SET ativo = 0 WHERE id = ?", [req.params.id], err => {
    if (err) return res.status(500).json({ error: 'Erro ao inativar.' });
    res.status(200).json({ ok: true });
  });
});



  
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Rodando na porta ${PORT}`);
});
