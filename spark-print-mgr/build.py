#!/usr/bin/env python

from __future__ import print_function

import os, shutil, subprocess, sys

### defaults ###

default_rules = ['build']

def flatten_manually( module ):
     """
	 Run flattening twice to account for the recursive ones. 
	 We may need to do it more times (if there are still some modules that moved, do it again)
     """
     def flatten_one_module( subModulePath, nodeModulePath ):
         somethingMoved = False;
         if (os.path.exists(os.path.join(subModulePath, "node_modules"))):
             for subSubModule in next(os.walk(os.path.join(subModulePath, "node_modules")))[1]:
                 subSubModulePath = os.path.join(subModulePath, "node_modules", subSubModule );
                 print( "\t MOVING: " + subSubModulePath + " to " +  nodeModulePath);
                 if (not os.path.exists(os.path.join( nodeModulePath, subSubModule ))):
                     shutil.move( subSubModulePath, nodeModulePath );
                     somethingMoved = True;
             try_remove_dirs(os.path.join(subModulePath, "node_modules"))
         return somethingMoved;
		 
     nodeModulePath = os.path.join(os.getcwd(), module, "node_modules");
     print( "FLATTENING Manually: " + nodeModulePath);
     moved = True;
     while moved:
         for subModule in next(os.walk(nodeModulePath))[1]:
             subModulePath = os.path.join(nodeModulePath, subModule)
             moved = flatten_one_module( subModulePath, nodeModulePath );
	 
def delete_extra_node_module_dirs():
     # Remove all the extra directories in node_modules that are not needed (test, example, src,...)
     serialPortDepsDir = os.path.join("serialport", "build", "Release", ".deps");
     for dirname, dirnames, filenames in os.walk('.'):
         # Also manually, delete serialport/build/Release/.deps - it is a leftover from the build
         # and it causes problems with the installers on windows.
         for subdirname in dirnames:
             fullPath = os.path.join(dirname, subdirname);
             # Skip the directories not in node_modules. 
             if (fullPath.find("node_modules") == -1):
                 continue;
             if (fullPath.find("test") != -1):
                 print("\t DELETING (test): " + fullPath);
                 try_remove_dirs(fullPath)
             if (fullPath.find("example") != -1):
                 print("\t DELETING (example): " + fullPath);
                 try_remove_dirs(fullPath)
             if (fullPath.find("src") != -1):
                 print("\t DELETING (src): " + fullPath);
                 try_remove_dirs(fullPath)
             if (fullPath.find("tools") != -1):
                 print("\t DELETING (tools): " + fullPath);
                 try_remove_dirs(fullPath)
             if (fullPath.find(os.path.join("Release", "obj")) != -1):
                 path, subdir = os.path.split(fullPath);
                 if (subdir == "obj"):
                     print("\t DELETING (obj): " + os.path.join("Release", "obj") + fullPath );
                     try_remove_dirs(fullPath)
             #if (fullPath.find(serialPortDepsDir) != -1):
                 #print("\t DELETING (serialPortDeps): " + fullPath);
                 #try_remove_dirs(fullPath);

### rules ###

def npmbuild():
     clean()
     clean_node()

     nodeCmd   = "npm"
     if (sys.platform == "win32"):
         nodeCmd = find_program_location("npm.cmd") 

     print("Install Dependencies ...")

     rc = subprocess.call([nodeCmd, "install", "--production"])
     if rc:
         print("node install failed, rc %d" % rc)
         sys.exit(rc)
	 
     if (sys.platform == "win32"):
         # Flatten node_module directory (since release engineering needs paths < 248 char)
         flattenCmd = find_program_location("flatten-packages.cmd") 
         if (flattenCmd):
             rc = subprocess.call([flattenCmd])
			 
			 # There seem to be a problem with usb modules when they get flatten so, delete
			 # them and reinstall usb without flattening.
             shutil.rmtree('node_modules/usb')
             shutil.rmtree('node_modules/usb-shyp-win32-ia32')
             shutil.rmtree('node_modules/usb-shyp-win32-x64')
			 
             rc = subprocess.call([nodeCmd, "install",  "--production", "usb@1.0.5" ])
			 
             # Flatten the nedb/browser-version module manually. 
             # flatten_manually( os.path.join("node_modules", "nedb", "browser-version") );
			 
             # Removed the browser-version module from nedb since we are not using it and
			 # it is causing probems with windows installers (too long paths)
             #print ("REMOVING: ", os.path.join( ".", "node_modules", "nedb", "browser-version"));
             #try_remove_dirs( os.path.join( ".", "node_modules", "nedb", "browser-version"), True );

         else:
             print("FAILED to flatten node_modules directory!")
     
	 # Delete the unnecessary dirs. 
     delete_extra_node_module_dirs();
				 
     print ("Build Succesful....")


def clean():
     print("Removing files...")
     try_remove("npm-debug.log")
     try_remove("print_manager.jx")
     try_remove("print_manager.jxp")

     if (sys.platform == "win32"):
         try_remove("node.jxp")
         try_remove("node.exe")
     else:
         try_remove("print_manager")
	 

def clean_node():
     print("Removing node files...")
     try_remove_dirs("./node_modules", True)
     try_remove_dirs("./files")
     try_remove_dirs("./db")


### utilities ###

def try_remove(path):
     try:
          os.remove(path)
     except OSError:
          print("FAILED TO REMOVE FILE: ", path)

def try_remove_dirs(path, forceExit=False):
     if os.path.exists(path):
         try:
             shutil.rmtree(path)
             while os.path.exists(path): # check if it exists
                 pass
         except OSError as err:
             print("FAILED TO REMOVE DIR: ", path, err.args)
             if forceExit:
                 print("\n\t Build Failed ! because it cannot remove:", path, err)
                 sys.exit(0);
     else:
         print("DIRECTORY DOES NOT EXISTS:", path);
		 
def find_program_location(program):
    for path in os.environ.get('PATH', '').split(';'):
        if os.path.exists(os.path.join(path, program)) and \
           not os.path.isdir(os.path.join(path, program)):
            return os.path.join(path, program)
    return None


### entry point ###

def main(rules=None):
     if not rules:
          rules = default_rules

     for rule in rules:
          if rule == 'build':
               npmbuild()
          elif rule == 'clean':
               clean_node()
          elif rule == 'npmClean':
               delete_extra_node_module_dirs();
          else:
               print("Unrecognized rule '%s'" % rule)
               sys.exit(1)

     print("Done.")

if __name__ == '__main__':
    main(sys.argv[1:])
