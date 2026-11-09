using System.Reflection;
using System.Runtime.Loader;
using System.Xml.Linq;
using System.Text.Json;
using KSA;
AssemblyLoadContext.Default.Resolving += (context, name) => {
    foreach (var folder in new[]{ Environment.GetEnvironmentVariable("KSA_ASSEMBLY_DIR"), Environment.GetEnvironmentVariable("KSA_DEPENDENCY_DIR") }.Where(folder => !string.IsNullOrEmpty(folder))) {
        var path = Path.Combine(folder!, name.Name + ".dll");
        if (File.Exists(path)) return context.LoadFromAssemblyPath(path);
    }
    return null;
};
if(args.Length==0) throw new ArgumentException("Pass flattened XML files or the export corpus sources.json artifact.");
Validate(args);
static void Validate(string[] paths) {
    var table = ModLibrary.TagTable;
    Console.WriteLine($"Tag bindings: {table.Bindings.Count}");
    var errors = new ContentErrors();
    int count=0, failed=0;
    var flats = new List<FlatRow>();
    if (paths[0].EndsWith(".json")) {
        var source=JsonDocument.Parse(File.ReadAllText(paths[0]));
        var rows=new List<XElement>();
        int fi=0;
        foreach(var file in source.RootElement.EnumerateArray()) {
            int ri=0; var name=file.GetProperty("file").GetString()!;
            foreach(var row in XDocument.Parse(file.GetProperty("xml").GetString()!).Root!.Elements()) {
                ContentStamps.Stamp(row,"Validation",0,name,fi,ri++); rows.Add(row);
            }
            fi++;
        }
        flats=ContentPrePass.Resolve(rows, errors);
        var family=typeof(ContentPrePass).Assembly.GetType("KSA.VariantFamilyCheck")!;
        family.GetMethod("Run", BindingFlags.Static|BindingFlags.Public)!.Invoke(null,new object[]{flats, errors});
        new XDocument(new XElement("Assets",flats.Select(f=>f.Row))).Save(paths[0]+".native.xml");
        Console.WriteLine($"Native prepass inputs: {rows.Count}; flattened: {flats.Count}; errors: {errors.Count}");
    } else {
        foreach(var path in paths) foreach(var row in XDocument.Load(path).Root!.Elements())
            flats.Add(new FlatRow(row,row.Name.LocalName,(string?)row.Attribute("Id")??"","Validation",0,path,0,flats.Count,new[]{path}));
    }
    foreach (var flat in flats) {
        if (!table.TryGet(flat.Tag,out var binding)) throw new Exception($"Unknown tag {flat.Tag}");
        if(ContentDeserializer.Deserialize(flat,binding,table,null,errors)==null) failed++;
        count++;
    }
    for(int i=0;i<errors.Count;i++) Console.WriteLine(errors[i]);
    Console.WriteLine($"Rows: {count}; failed: {failed}; errors: {errors.Count}");
    Environment.ExitCode=errors.Count==0?0:1;
}
