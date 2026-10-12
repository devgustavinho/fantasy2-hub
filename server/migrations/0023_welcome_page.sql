CREATE TABLE welcome_page (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO welcome_page (id, title, body) VALUES (
  1,
  'Bem-vindo ao Fantasy 2',
  'Se você acabou de chegar, esta página reúne as orientações do condomínio. A administração pode atualizar o texto quando as regras mudarem.

## Regras de convivência

_A administração ainda vai escrever este trecho._

## Áreas comuns

_A administração ainda vai escrever este trecho._

## Horários e silêncio

_A administração ainda vai escrever este trecho._

## Mudanças e obras

_A administração ainda vai escrever este trecho._

## Lixo

_A administração ainda vai escrever este trecho._

## Contatos

Em caso de dúvida, procure a portaria.'
);
