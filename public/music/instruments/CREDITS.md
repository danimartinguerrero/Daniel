# Instrument renders

- [Epiphone Les Paul Standard](https://sketchfab.com/3d-models/epiphone-les-paul-standard-bd6d9c5cb48743288106cfa1d527932c) by [proudlove1](https://sketchfab.com/proudlove1). Ebony finish with separate body lacquer, raised nickel-silver fret crowns, mottled inlays and graduated black control knobs.
- [Fender PJ Bass](https://sketchfab.com/3d-models/fender-pj-bass-50bdb58f21dd4d2bb6d4b884b760ce52) by [Ryan_Nein](https://sketchfab.com/Ryan_Nein). The green paint was changed to black. The body was subdivided, the pickguard bevel received a dark centre ply and contact occlusion was baked into the material maps.

Both models are licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The originals are available in the [Objaverse archive](https://huggingface.co/datasets/allenai/objaverse): `glbs/000-060/bd6d9c5cb48743288106cfa1d527932c.glb` and `glbs/000-107/50bdb58f21dd4d2bb6d4b884b760ce52.glb`.

The neck textures incorporate luminance detail from Poly Haven’s [White Maple Veneer](https://polyhaven.com/a/white_maple_veneer) for the bass and [Natural Walnut Veneer](https://polyhaven.com/a/natural_walnut_veneer) for the guitar. Both scans are CC0 and their grain is baked into the existing colour atlases.

The environment lighting comes from Sergej Majboroda’s [Studio Small 09](https://polyhaven.com/a/studio_small_09), licensed under [CC0](https://polyhaven.com/license). The page uses a 512 × 256 HDR copy of the 1K Radiance panorama. An 85 mm camera, a shadow-casting key light, two rim lights and a feathered front strip complete the setup. The environment is visible in the reflections while the background stays black.

The live models use meshopt compression and WebP textures. The upright stills are captures from the same WebGL renderer and are shown with reduced motion or when 3D is unavailable.

### Reproducing the assets

Export each source with `python scripts/export-instruments.py NAME SOURCE.glb NAME.raw.glb GRAIN.jpg` in a Python 3.11 environment with `bpy==4.5.3`, NumPy and Pillow. Use the corresponding scan’s 2K diffuse JPG for GRAIN.jpg. Then run the appropriate command with glTF Transform 4.5.1.

```sh
gltf-transform optimize pj-bass.raw.glb public/music/instruments/pj-bass.glb --compress meshopt --simplify-error 0.00006 --simplify-ratio 0.3 --texture-compress webp --texture-size 2048
gltf-transform optimize les-paul.raw.glb public/music/instruments/les-paul.glb --compress meshopt --simplify false --texture-compress webp --texture-size 2048
```

For each still, call the live renderer’s `resize(1624, 1)` and set the pose with `pose(0)` for the guitar or `pose(1)` for the bass. Capture its canvas in the same frame, then downsample to 960 × 960 and save as WebP. These tools are only used when regenerating the assets.
