' Hidden launcher for the Docket daemon — run by the "DocketDaemon" logon Scheduled Task so no console
' window flashes. Starts node docket-daemon.js and appends stdout/stderr to a rolling log.
Dim shell, fso, here, node, script, logf
Set shell = CreateObject("WScript.Shell")
Set fso   = CreateObject("Scripting.FileSystemObject")
here   = fso.GetParentFolderName(WScript.ScriptFullName)
' node.exe from PATH; override with the DOCKET_NODE env var if it isn't on PATH.
node   = shell.ExpandEnvironmentStrings("%DOCKET_NODE%")
If node = "%DOCKET_NODE%" Or node = "" Then node = "node.exe"
script = fso.BuildPath(here, "docket-daemon.js")
logf   = shell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\docket-daemon.log"
' 0 = hidden window, False = don't wait. cmd /c wraps the redirection.
shell.Run "cmd /c """"" & node & """ """ & script & """ >> """ & logf & """ 2>&1""", 0, False
