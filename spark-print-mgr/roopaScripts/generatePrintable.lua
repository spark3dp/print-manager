local args = readStdin()
print( encodeJSON( Trays.generatePrintable( args ) ) )
