"""Alpha silhouettes of a site GLB every STEP degrees about its long axis, as the page's WebGL camera sees it
(85 mm, the frame 1.1 instrument lengths wide): python -I instrument-outlines.py MODEL.glb OUTPUT_DIRECTORY SIZE STEP.
The first step of scripts/instrument-outlines.mjs."""
import sys
from math import radians
from pathlib import Path
import bpy

src, out, size, step = sys.argv[1], Path(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4])
out.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
roots = [o for o in bpy.context.scene.objects if o.parent is None]
pivot = bpy.data.objects.new('P', None); bpy.context.collection.objects.link(pivot)
for o in roots:
    m = o.matrix_world.copy(); o.parent = pivot; o.matrix_world = m
scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE_NEXT'
scene.eevee.taa_render_samples = 4
scene.render.film_transparent = True
scene.render.resolution_x = scene.render.resolution_y = size
scene.render.image_settings.file_format = 'PNG'; scene.render.image_settings.color_mode = 'RGBA'
d = 1.1 * 85 / 36
bpy.ops.object.camera_add(location=(0, -d, 0))
cam = bpy.context.object
cam.rotation_euler = (-cam.location).to_track_quat('-Z', 'Y').to_euler()
cam.data.lens = 85
scene.camera = cam
for angle in range(0, 360, step):
    pivot.rotation_euler = (0, 0, radians(angle))
    scene.render.filepath = str(out / f'{angle:03d}.png')
    bpy.ops.render.render(write_still=True)
