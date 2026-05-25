create a whole new export feature in the export dialog which can write a KSA game part mod output.

i want this to utilize the browser feature which allows an end-user to permission a folder for write access using the file system api. 

i have built features with this and it works great.

an important feature is that you can serialize the granted permission to IndexedDB which stores the opaque access grant so that on page reloads that the filesystem grants are still in place.  the UX needs to know if they need to be re-granted though and show this on a simple button in case the grant expires or is lost for some other reason.

i want the end-user to select their `$HOME/Documents/Kitten Space Agency/mods` folder for write access, and then this new feature would create a "flexo-parts" folder under here and when doing exports would write and  update the XML and TOML files under this directory which make up a part mod.

the files in the folder would be the:

- mod.toml
- XML files with the Part and GameData XMLs we generate from our project.  we should generate a XML file per Part and GameData and then update the mod.toml with the list of XML files to include them to keep things simple (instead of trying to merge multiple projects XML into shared files, which would complicate maintenance)

the mod.toml looks like this:

```toml
name = "flexo-parts"
assets = [ "Project1Part.xml", "Project1GameData.xml"]
```

I ALSO want a "download mod zip" button which would build a zip with a folder "flexo-parts" with the mod.toml single part + game data XML files.

The feature which writes to the filesystem should be non-destructive by creating non-conflicting filenames for XML files if ones pre-exist, and update the mod.toml with the current complete set of XML files in the folder regardless of the current list of assets.

the indexeddb filesystem grants should be a global thing in indexeddb unrelated to project-level data in any way.