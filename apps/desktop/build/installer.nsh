!macro customWelcomePage
  # assisted installer 会在升级或提权后跳过安装模式页。保留一个稳定的首屏，
  # 目录页点击“上一步”时就不会因为前一页被跳过而直接退出安装进程。
  !insertmacro MUI_PAGE_WELCOME
!macroend
