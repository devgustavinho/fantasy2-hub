# Documentos do condomínio

| Arquivo | Uso |
|---|---|
| `manual-do-proprietario.pdf` | UI `/documentos` + `GET /docs/manual-do-proprietario` (morador aprovado) |
| `manual-do-proprietario.txt` | Corpus RAG (`source_type=manual`, `source_id=proprietario`) no `rag:reindex` |

O `.txt` foi extraído do PDF (texto selecionável). No ingest, `prepareManualForIndex` remove o índice/TOC e promove seções (ex. `PERDA DA GARANTIA`) a headings `##` antes do chunking. Se o PDF for atualizado, reextraia o texto e rode `npm run rag:reindex` (ou Reindexar em `/perguntar`; use `--force` se só o prep mudou).
