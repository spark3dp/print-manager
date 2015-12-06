newFile()
local args = readStdin()
print( encodeJSON( Meshes.import( args ) ) )
