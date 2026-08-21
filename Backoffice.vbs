Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
command = "cmd.exe /c call """ & scriptDir & "\Backoffice.bat"""

shell.Run command, 0, False
