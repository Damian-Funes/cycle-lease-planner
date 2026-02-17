

## Proteger Catalogo com Senha

Quando o usuario clicar no botao "Catalogo de Equipamentos" na pagina principal, um modal de senha aparecera antes de permitir o acesso.

### Como vai funcionar

1. O usuario clica no botao de Catalogo
2. Um dialog aparece pedindo a senha
3. Se a senha digitada for correta, o usuario e redirecionado para `/catalogo`
4. Se errar, aparece uma mensagem de erro
5. A senha sera armazenada no codigo como constante: `0LSdobrasil2026@`
6. Uma vez autenticado, a sessao fica salva no `sessionStorage` para nao pedir senha novamente ate fechar o navegador

### Alteracoes tecnicas

**1. `src/pages/Index.tsx`**
- Adicionar um componente de Dialog (modal) com campo de senha
- Ao clicar no botao de Catalogo, abrir o modal em vez de navegar diretamente
- Validar a senha digitada e redirecionar via `useNavigate` se correta

**2. `src/pages/Catalogo.tsx`**
- Adicionar verificacao no `useEffect`: se nao houver flag de autenticacao no `sessionStorage`, redirecionar de volta para `/`
- Isso impede acesso direto pela URL sem passar pela senha

A senha `0LSdobrasil2026@` sera hardcoded no frontend. Nao sera necessario backend adicional para isso.

