# Models on the wall (`/music/c1`)

Both models are third-party work under CC-BY 4.0. Each file keeps its author, licence and source in
its glTF `asset.extras`.

- `guitar.glb`: "Guitar: Gibson Les Paul Standard" by Jonas Schramme (https://sketchfab.com/JonasSchramme),
  CC-BY 4.0, https://sketchfab.com/3d-models/guitar-gibson-les-paul-standard-d75216a52ff14a56aa40b6fec844ecd2
- `bass.glb`: "Fender PJ Bass" by Ryan_Nein (https://sketchfab.com/Ryan_Nein), CC-BY 4.0,
  https://sketchfab.com/3d-models/fender-pj-bass-50bdb58f21dd4d2bb6d4b884b760ce52

Downloaded on 2026-11-18 from the Objaverse mirror of Sketchfab's CC-licensed models
(https://huggingface.co/datasets/allenai/objaverse, `glbs/000-099/d75216a5….glb` and
`glbs/000-107/50bdb58f….glb`).

Changes: made smaller for the web with glTF-Transform 4.5.1. The geometry is meshopt-compressed and the
textures are WebP at 1024 px; the bass is also simplified from 337k to 113k triangles (21.2 MB → 1.7 MB).

```bash
gltf-transform optimize bass-pj.glb bass.glb --compress meshopt --texture-compress webp --texture-size 1024 --simplify true --simplify-ratio 0.2 --simplify-error 0.0005
gltf-transform optimize lp-jonas.glb guitar.glb --compress meshopt --texture-compress webp --texture-size 1024 --simplify false
```
