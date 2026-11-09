# ConPTY empacotado

`conpty.dll` e `OpenConsole.exe` do pacote NuGet `Microsoft.Windows.Console.ConPTY` 1.25.260930003
(Microsoft, licença MIT, https://github.com/microsoft/terminal).

O ConPTY que vem no Windows descarta os pedidos de mouse dos apps (`ESC[?1000h`, `ESC[?1006h`):
o xterm nunca liga o modo mouse e os botões clicáveis das TUIs (Claude Code, plugins) não funcionam.
O portable-pty prefere um `conpty.dll` ao lado do executável; o instalador do Windows os põe lá
(`tauri.windows.conf.json`).
