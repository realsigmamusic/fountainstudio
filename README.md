# Fountain Studio

Um editor de roteiros que roda direto no navegador, no computador ou no celular. Você escreve em [Fountain](https://fountain.io), um formato de texto simples feito para roteiros, e o Fountain Studio mostra o resultado formatado e gera um PDF no padrão da indústria.

**Use agora:** https://realsigmamusic.github.io/fountainstudio/

Não precisa de cadastro, de conta nem de instalação.

---

## O que você pode fazer

### Escrever sem se preocupar com formatação
Escreva o roteiro como texto comum. O editor entende as regras do Fountain e cuida da formatação: cabeçalhos de cena, ações, personagens, diálogos, parentéticos, transições, diálogo duplo, letras de música, notas e muito mais.

### Ver o roteiro formatado enquanto escreve
A aba **Preview** mostra como o roteiro vai ficar, atualizada em tempo real. Ao mover o cursor no texto, o preview acompanha. Ao tocar em um trecho do preview, você volta para o ponto correspondente no editor.

### Navegar pela estrutura da história
A aba **Outline** mostra seus atos, seções e cenas em forma de árvore, com as sinopses e notas de cada uma. Basta tocar em um item para ir até ele. O botão **⇕ Cenas** dobra e desdobra todas as cenas de uma vez, o que ajuda em roteiros longos.

### Exportar PDF profissional
O botão **PDF** gera o roteiro no formato padrão de mercado, com a fonte Courier Prime. Antes de gerar, você escolhe:

- papel A4 ou Carta (US);
- página de título;
- numeração de páginas e de cenas (esquerda, direita, ambas ou nenhuma);
- cabeçalhos de cena e nomes de personagem em negrito;
- diálogo duplo e divisão de diálogos entre páginas (MORE / CONT'D);
- cada cena em uma nova página;
- impressão de seções, sinopses e notas;
- numeração de falas;
- cabeçalho, rodapé e marca d'água personalizados;
- marcadores (bookmarks) de cenas e seções no PDF;
- **destaque de personagens**: marque as falas de um personagem, útil para ensaios e leituras de mesa.

O PDF pode ser visto dentro do próprio app e baixado depois.

### Trabalhar com vários roteiros
Pelo botão **☰** você cria, abre e exclui roteiros. Tudo é salvo automaticamente enquanto você escreve.

### Abrir e salvar arquivos
- **Abrir** importa arquivos `.fountain`, `.txt` e `.spmd`.
- **Salvar** exporta o roteiro como `.fountain`, que você pode abrir em outros programas compatíveis, como Highland, Trelby e Fade In.

### Funcionar offline e como aplicativo
Depois do primeiro acesso, o Fountain Studio funciona sem internet. Você pode instalá-lo na tela inicial do celular ou no computador, e ele passa a se comportar como um aplicativo comum:

- **Android (Chrome):** menu ⋮ → *Instalar app* ou *Adicionar à tela inicial*.
- **Computador (Chrome ou Edge):** ícone de instalação na barra de endereço.

---

## Sua privacidade

Seus roteiros ficam **somente no seu aparelho**, guardados no armazenamento do navegador. Nada é enviado para servidores.

Por isso:

- **Faça backups.** Use o botão **Salvar** de vez em quando para guardar uma cópia `.fountain`.
- Limpar os dados do navegador ou do site apaga os roteiros que estão apenas no app.
- Os roteiros não são sincronizados entre aparelhos. Para mudar de aparelho, salve o arquivo e abra no outro.

---

## Guia rápido de Fountain

| Para escrever | Faça assim |
|---|---|
| Cena | `INT. SALA - DIA` (ou force com um ponto: `.CENA ESPECIAL`) |
| Personagem e fala | Nome em MAIÚSCULAS, e o diálogo na linha seguinte |
| Personagem sem letras ou em minúsculas | Comece com `@`, por exemplo `@007` |
| Parentético | `(irritado)` entre o nome e a fala |
| Ação forçada | Comece com `!` |
| Transição | `FADE TO:` ou force com `>` |
| Texto centralizado | `> FIM <` |
| Diálogo duplo | Adicione `^` ao nome do segundo personagem |
| Letra de música | Comece a linha com `~` |
| Nota | `[[sua nota aqui]]` (não aparece no PDF, a menos que você ative) |
| Seção (ato, sequência) | `# ATO I`, `## Sequência` |
| Sinopse | `= Resumo da cena` |
| Quebra de página | `===` |
| Itálico, negrito, sublinhado | `*itálico*`, `**negrito**`, `_sublinhado_` |
| Página de título | `Title:`, `Credit:`, `Author:` etc., no início do arquivo |

Ao abrir o app pela primeira vez, você vai encontrar um roteiro de exemplo com todos esses recursos para testar.

---

## Dúvidas comuns

**Meus roteiros sumiram.**
Eles ficam no navegador. Se você limpou os dados do site ou está usando outro navegador ou aparelho, eles não aparecem. Por isso é importante salvar cópias `.fountain`.

**Posso usar no celular?**
Sim. No celular, as abas **Outline**, **Editar** e **Preview** ficam no topo e você alterna entre elas.

**O app funciona sem internet?**
Sim, depois do primeiro acesso.

**Encontrei um erro ou tenho uma sugestão.**
Abra uma [issue](https://github.com/realsigmamusic/fountainstudio/issues) aqui no GitHub.

---

## Créditos e licença

O Fountain Studio é software livre, sob a licença [MIT](LICENSE).

Ele usa, entre outros, componentes dos projetos BetterFountain / Afterwriting (interpretação do Fountain e geração de PDF), CodeMirror (editor), PDFKit e PDF.js (PDF) e a fonte Courier Prime. As licenças de terceiros estão na pasta `third_party`.
