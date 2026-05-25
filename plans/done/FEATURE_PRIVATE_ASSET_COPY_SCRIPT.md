# feature

i want a bun script (use the bun skill) which uses bun-native File I/O for all operations

the script should be at @scripts/copy-ksa-assets-to-private-repo.ts

what the script should do is:


1. Scan (using a relative path from the script directory) `../thirdparty/ksa/Content/Core` for all *.XML files which contain `<Assets>`
2. Copy all these files (perserving their relative path after Core/) to a target directory specified with argument --target (use parseArgs to manage cli flags)
3. Each Assets XML file needs to be scanned to find references to .ktx2 texture files and .glb model files.  each discovered one needs to also be coppied to the --target dir similarly preserving their relative paths

The goal here is to find all Part/SubPart assets XML files, copy those, and find all .ktx2 texture files and .glb model files that they reference and copy those.

The result should be similar to our current ksaAssets copy (which is hard-coding known filenames which isn't great), i want this to be dynamic

Here is what the current dist/ksa/ dir looks like after a build (recursive ls to show the output structure)

```
➜ ls -lahR dist/ksa
Permissions Size User     Date Modified Name
.rw-------@  12k asherwin 25 May 14:06  CoreCommandAAssets.xml
.rw-------@ 1.4k asherwin 25 May 14:06  CoreCommandAGameData.xml
.rw-------@  63k asherwin 25 May 14:06  CoreCouplingAAssets.xml
.rw-------@  623 asherwin 25 May 14:06  CoreCouplingAGameData.xml
.rw-------@  40k asherwin 25 May 14:06  CoreElectricalAAssets.xml
.rw-------@ 5.2k asherwin 25 May 14:06  CoreElectricalAGameData.xml
.rw-------@  15k asherwin 25 May 14:06  CoreFairingAAssets.xml
.rw-------@ 2.1k asherwin 25 May 14:06  CoreFairingAGameData.xml
.rw-------@  54k asherwin 25 May 14:06  CoreFuelTankAAssets.xml
.rw-------@  25k asherwin 25 May 14:06  CoreIVAPropAAssets.xml
.rw-------@  93k asherwin 25 May 14:06  CoreIVASpaceAAssets.xml
.rw-------@  846 asherwin 25 May 14:06  CoreIVASpaceAGameData.xml
.rw-------@ 3.8k asherwin 25 May 14:06  CoreLandingAAssets.xml
.rw-------@  454 asherwin 25 May 14:06  CoreLandingAGameData.xml
.rw-------@  13k asherwin 25 May 14:06  CorePassageAAssets.xml
.rw-------@  542 asherwin 25 May 14:06  CorePassageAGameData.xml
.rw-------@  42k asherwin 25 May 14:06  CorePropulsionAAssets.xml
.rw-------@  39k asherwin 25 May 14:06  CorePropulsionBAssets.xml
.rw-------@ 8.7k asherwin 25 May 14:06  CorePropulsionBGameData.xml
.rw-------@ 6.9k asherwin 25 May 14:06  CoreServiceModuleAAssets.xml
.rw-------@  58k asherwin 25 May 14:06  CoreStructuralAAssets.xml
.rw-------@ 1.8k asherwin 25 May 14:06  CoreStructuralAGameData.xml
drwxr-xr-x@    - asherwin 25 May 14:06  Meshes
.rw-------@ 1.9k asherwin 25 May 14:06  PartAssets.xml
.rw-------@  63k asherwin 25 May 14:06  PartGameData.xml
drwxr-xr-x@    - asherwin 25 May 14:06  Textures

dist/ksa/Meshes:
Permissions Size User     Date Modified Name
.rw-------@ 426k asherwin 25 May 14:06  circle_light.glb
.rw-------@ 445k asherwin 25 May 14:06  CoreCommandA_MeshAtlas.glb
.rw-------@ 595k asherwin 25 May 14:06  CoreCouplingA_MeshAtlas.glb
.rw-------@ 518k asherwin 25 May 14:06  CoreElectricalA_MeshAtlas.glb
.rw-------@ 1.1M asherwin 25 May 14:06  CoreFairingA_MeshAtlas.glb
.rw-------@ 3.8M asherwin 25 May 14:06  CoreFuelTankA_MeshAtlas.glb
.rw-------@ 1.6M asherwin 25 May 14:06  CoreIVAPropA_MeshAtlas.glb
.rw-------@ 2.6M asherwin 25 May 14:06  CoreIVASpaceA_MeshAtlas.glb
.rw-------@ 235k asherwin 25 May 14:06  CoreLandingA_MeshAtlas.glb
.rw-------@ 446k asherwin 25 May 14:06  CorePassageA_MeshAtlas.glb
.rw-------@ 1.8M asherwin 25 May 14:06  CorePropulsionA_MeshAtlas.glb
.rw-------@ 823k asherwin 25 May 14:06  CorePropulsionB_MeshAtlas.glb
.rw-------@ 1.1M asherwin 25 May 14:06  CoreServiceModuleA_MeshAtlas.glb
.rw-------@ 1.3M asherwin 25 May 14:06  CoreStructuralA_MeshAtlas.glb

dist/ksa/Textures:
Permissions Size User     Date Modified Name
.rw-------@ 1.2M asherwin 25 May 14:06  CoreCommandA_TextureAtlas_Diffuse.ktx2
.rw-------@  642 asherwin 25 May 14:06  CoreCommandA_TextureAtlas_Emissive.ktx2
.rw-------@ 510k asherwin 25 May 14:06  CoreCommandA_TextureAtlas_Normal.ktx2
.rw-------@ 3.4M asherwin 25 May 14:06  CoreCommandA_TextureAtlas_PBR.ktx2
.rw-------@ 748k asherwin 25 May 14:06  CoreCouplingA_TextureAtlas_Diffuse.ktx2
.rw-------@  97k asherwin 25 May 14:06  CoreCouplingA_TextureAtlas_Normal.ktx2
.rw-------@ 1.3M asherwin 25 May 14:06  CoreCouplingA_TextureAtlas_PBR.ktx2
.rw-------@ 1.6M asherwin 25 May 14:06  CoreElectricalA_TextureAtlas_Diffuse.ktx2
.rw-------@  715 asherwin 25 May 14:06  CoreElectricalA_TextureAtlas_Emissive.ktx2
.rw-------@ 246k asherwin 25 May 14:06  CoreElectricalA_TextureAtlas_Normal.ktx2
.rw-------@ 3.2M asherwin 25 May 14:06  CoreElectricalA_TextureAtlas_PBR.ktx2
.rw-------@ 1.5M asherwin 25 May 14:06  CoreFairingA_TextureAtlas_Diffuse.ktx2
.rw-------@ 138k asherwin 25 May 14:06  CoreFairingA_TextureAtlas_Normal.ktx2
.rw-------@ 3.6M asherwin 25 May 14:06  CoreFairingA_TextureAtlas_PBR.ktx2
.rw-------@ 2.2M asherwin 25 May 14:06  CoreFuelTankA_TextureAtlas_Diffuse.ktx2
.rw-------@ 1.1M asherwin 25 May 14:06  CoreFuelTankA_TextureAtlas_Normal.ktx2
.rw-------@ 3.5M asherwin 25 May 14:06  CoreFuelTankA_TextureAtlas_PBR.ktx2
.rw-------@ 2.8M asherwin 25 May 14:06  CoreIVAPropA_TextureAtlas_Diffuse.ktx2
.rw-------@  681 asherwin 25 May 14:06  CoreIVAPropA_TextureAtlas_Emissive.ktx2
.rw-------@ 1.5M asherwin 25 May 14:06  CoreIVAPropA_TextureAtlas_Normal.ktx2
.rw-------@ 3.5M asherwin 25 May 14:06  CoreIVAPropA_TextureAtlas_PBR.ktx2
.rw-------@ 3.2M asherwin 25 May 14:06  CoreIVASpaceA_TextureAtlas_Diffuse.ktx2
.rw-------@ 2.6M asherwin 25 May 14:06  CoreIVASpaceA_TextureAtlas_Normal.ktx2
.rw-------@ 4.0M asherwin 25 May 14:06  CoreIVASpaceA_TextureAtlas_PBR.ktx2
.rw-------@ 1.5M asherwin 25 May 14:06  CoreLandingA_TextureAtlas_Diffuse.ktx2
.rw-------@  37k asherwin 25 May 14:06  CoreLandingA_TextureAtlas_Normal.ktx2
.rw-------@ 2.2M asherwin 25 May 14:06  CoreLandingA_TextureAtlas_PBR.ktx2
.rw-------@ 1.3M asherwin 25 May 14:06  CorePassageA_TextureAtlas_Diffuse.ktx2
.rw-------@  896 asherwin 25 May 14:06  CorePassageA_TextureAtlas_Emissive.ktx2
.rw-------@ 145k asherwin 25 May 14:06  CorePassageA_TextureAtlas_Normal.ktx2
.rw-------@ 2.0M asherwin 25 May 14:06  CorePassageA_TextureAtlas_PBR.ktx2
.rw-------@ 1.9M asherwin 25 May 14:06  CorePropulsionA_TextureAtlas_Diffuse.ktx2
.rw-------@ 665k asherwin 25 May 14:06  CorePropulsionA_TextureAtlas_Normal.ktx2
.rw-------@ 3.5M asherwin 25 May 14:06  CorePropulsionA_TextureAtlas_PBR.ktx2
.rw-------@ 1.0M asherwin 25 May 14:06  CorePropulsionB_TextureAtlas_Diffuse.ktx2
.rw-------@ 179k asherwin 25 May 14:06  CorePropulsionB_TextureAtlas_Normal.ktx2
.rw-------@ 1.7M asherwin 25 May 14:06  CorePropulsionB_TextureAtlas_PBR.ktx2
.rw-------@ 1.3M asherwin 25 May 14:06  CoreServiceModuleA_TextureAtlas_Diffuse.ktx2
.rw-------@ 391k asherwin 25 May 14:06  CoreServiceModuleA_TextureAtlas_Normal.ktx2
.rw-------@ 3.1M asherwin 25 May 14:06  CoreServiceModuleA_TextureAtlas_PBR.ktx2
.rw-------@ 2.5M asherwin 25 May 14:06  CoreStructuralA_TextureAtlas_Diffuse.ktx2
.rw-------@ 516k asherwin 25 May 14:06  CoreStructuralA_TextureAtlas_Normal.ktx2
.rw-------@ 3.4M asherwin 25 May 14:06  CoreStructuralA_TextureAtlas_PBR.ktx2
.rw-------@ 431k asherwin 25 May 14:06  T_LightPack_2_BaseColor.ktx2
.rw-------@ 3.8k asherwin 25 May 14:06  T_LightPack_2_Emissive_Cold.ktx2
.rw-------@  96k asherwin 25 May 14:06  T_LightPack_2_Normal.ktx2
.rw-------@ 125k asherwin 25 May 14:06  T_LightPack_2_PBR.ktx2
```

We should end up with a similar folder structure but discover the files to copy dynamically.

You can use console.log for logging to describe what the script is doing and when it discovers xml, ktx2 and glb files and what was copied.

for testing purposes you can send the output to folder `.tmp/` in the root of this project which is gitignore'd already

the goal is for this target folder to be a private github repo which will be refernced during a GitHub pages build of the flexo SPA vite webapp so that the ktx2 and glb files can be protected since they are private assets.  i have a license to distirbute them, but i dont want to put them in a public github repo in flexo which is open source, so i only want to reference them at ci pipeline build time.

