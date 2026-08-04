# Acessar o Portainer da VM

O Portainer roda como container na VM de produção, escutando **só em
`127.0.0.1:9443`** (não é exposto publicamente). Para acessar do seu
computador, é preciso abrir um túnel SSH até a VM.

---

## 1. Abrir o túnel SSH

No seu PC (PowerShell, terminal, etc.):

```bash
ssh -L 9443:localhost:9443 root@IP_DA_VM
```

Troque `IP_DA_VM` pelo IP real da VM. Mantenha esse terminal aberto — o
túnel só funciona enquanto essa sessão SSH estiver conectada.

---

## 2. Abrir o Portainer no navegador

Com o túnel ativo, acesse no navegador:

```
https://localhost:9443
```

O navegador vai mostrar um aviso de **certificado inválido/não confiável**
— isso é esperado, o Portainer usa um certificado autoassinado. Clique em
**"Avançado"** → **"Prosseguir para localhost (não seguro)"**. A conexão
continua criptografada; o aviso é só porque o certificado não é validado
por uma autoridade externa.

---

## 3. Primeiro acesso (criar usuário admin)

Na primeira vez, o Portainer pede:

- **Username**: escolha um usuário admin.
- **Password**: mínimo de 12 caracteres.
- **Setup token**: token de segurança gerado nos logs do container na
  primeira inicialização. Para pegar o token, rode na VM:

  ```bash
  docker logs portainer 2>&1 | grep -i "setup token"
  ```

  Se não aparecer nada, veja o início do log completo:

  ```bash
  docker logs portainer 2>&1 | head -50
  ```

⚠️ **A criação do admin expira em poucos minutos** (proteção de segurança
contra outra pessoa criar a conta primeiro). Se a tela mostrar "Your
Portainer instance timed out", reinicie o container para resetar o prazo
e tente de novo mais rápido:

```bash
docker restart portainer
```

---

## 4. Uso do dia a dia

Depois de logado, o Portainer já detecta automaticamente o Docker da
própria VM ("local environment") — não precisa adicionar nada manualmente.
Lá você pode:

- Ver os containers rodando (`taxa-frequencia-app-1`, `taxa-frequencia-db-1`,
  `taxa-frequencia-cron-1`).
- Ver logs de cada container em tempo real.
- Reiniciar/parar/iniciar containers.
- Abrir um console/terminal dentro de um container.
- Ver e gerenciar volumes (ex.: `pgdata`).

Para acessar depois, basta repetir o passo 1 (abrir o túnel SSH) e o
passo 2 (`https://localhost:9443`) — o admin já vai estar criado, então
é só fazer login normal com usuário e senha.

---

## Nota de segurança

O Portainer tem acesso total ao Docker da VM (equivalente a root no
servidor) e ao banco de dados de produção. Por isso ele **não** é exposto
publicamente — o acesso só é possível via túnel SSH, o que significa que
só quem tem uma chave/senha SSH válida para a VM consegue chegar até ele.
Não exponha a porta 9443 diretamente no firewall público.
