@echo off
set "LIB=C:\Program Files (x86)\Windows Kits\10\Lib\10.0.22621.0\um\x64;C:\Program Files (x86)\Windows Kits\10\Lib\10.0.22621.0\ucrt\x64;C:\Program Files\Microsoft Visual Studio\18\Community\VC\Tools\MSVC\14.50.35717\lib\x64"
C:\Users\Admin\.cargo\bin\cargo.exe test -p goose -- core:: --no-fail-fast
