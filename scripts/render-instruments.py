"""Offline studio bake: python render-instruments.py NAME SOURCE.glb OUTPUT_DIRECTORY."""

import io
import json
import sys
import tempfile
from math import radians, sin, pi
from pathlib import Path

import bpy
import numpy as np
from mathutils import Matrix, Vector
from PIL import Image

FRAMES = 96  # poses, from lying flat to upright
SIZE = 1440  # px, square
FRAME_WIDTH = 1.1  # the frame's width at the instrument, in instrument lengths
SAMPLES = 48
WIDTHS = (960, 1440)  # px, the sizes the page picks from


def softbox(name, position, energy, width, height, color, target):
    lamp = bpy.data.lights.new(name, 'AREA')
    lamp.energy, lamp.shape, lamp.size, lamp.size_y, lamp.color = energy, 'RECTANGLE', width, height, color
    obj = bpy.data.objects.new(name, lamp)
    bpy.context.collection.objects.link(obj)
    obj.location = position
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()


def black_bass_finish():
    nodes = bpy.data.materials['BodyMaterial'].node_tree.nodes
    texture = nodes['Principled BSDF'].inputs['Base Color'].links[0].from_node
    original = Image.open(io.BytesIO(texture.image.packed_file.data)).convert('RGB')
    pixels = np.asarray(original).astype(float)
    red, green, blue = pixels.transpose(2, 0, 1)
    paint = (green > red * 1.07) & (green > blue * 1.025)
    pixels[paint] = (green[paint, None] / 255) * [21, 23, 26]
    encoded = io.BytesIO()
    Image.fromarray(pixels.astype('uint8')).save(encoded, 'PNG')
    data = encoded.getvalue()
    texture.image.pack(data=data, data_len=len(data))
    texture.image.reload()


def satin(material, floor=.46):
    """A satin finish, not a mirror: the paint is no smoother than `floor` and has no clear coat, while
    the metal (pickups, bridge, tuners) keeps the roughness it was modelled with."""
    tree = material.node_tree
    surface = next(node for node in tree.nodes if node.type == 'BSDF_PRINCIPLED')
    surface.inputs['Coat Weight'].default_value = 0
    for link in list(surface.inputs['Coat Weight'].links):
        tree.links.remove(link)
    roughness, metallic = surface.inputs['Roughness'], surface.inputs['Metallic']
    original = roughness.links[0].from_socket if roughness.links else None
    paint = tree.nodes.new('ShaderNodeMath')
    paint.operation = 'MAXIMUM'
    paint.inputs[1].default_value = floor
    if original:
        tree.links.new(original, paint.inputs[0])
    else:
        paint.inputs[0].default_value = roughness.default_value
    mix = tree.nodes.new('ShaderNodeMix')
    mix.data_type = 'FLOAT'
    if metallic.links:
        tree.links.new(metallic.links[0].from_socket, mix.inputs['Factor'])
    else:
        mix.inputs['Factor'].default_value = metallic.default_value
    tree.links.new(paint.outputs[0], mix.inputs['A'])
    if original:
        tree.links.new(original, mix.inputs['B'])
    else:
        mix.inputs['B'].default_value = roughness.default_value
    tree.links.new(mix.outputs['Result'], roughness)


def render(name, source, output, frames, preview=False):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source.resolve()))
    if name == 'pj-bass':
        black_bass_finish()
    satin(bpy.data.materials['BodyMaterial' if name == 'pj-bass' else 'MainBake'])
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    corners = [obj.matrix_world @ Vector(point) for obj in meshes for point in obj.bound_box]
    lower, upper = (Vector(fn(point[axis] for point in corners) for axis in range(3)) for fn in (min, max))
    up, front = ((0, 0, 1), (0, -1, 0)) if name == 'pj-bass' else ((1, 0, 0), (0, 0, 1))
    up, front = Vector(up), Vector(front)
    basis = Matrix([up.cross(front), -front, up]).to_4x4()
    normalize = Matrix.Scale(1 / max(upper - lower), 4) @ basis @ Matrix.Translation(-(lower + upper) / 2)
    roots = [obj for obj in bpy.context.scene.objects if obj.parent is None]
    pivot = bpy.data.objects.new('Instrument', None)
    bpy.context.collection.objects.link(pivot)
    for obj in roots:
        local = normalize @ obj.matrix_world
        obj.parent = pivot
        obj.matrix_world = local

    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    devices = bpy.context.preferences.addons['cycles'].preferences
    if 'METAL' in {entry[0] for entry in devices.get_device_types(bpy.context)}:
        devices.compute_device_type = 'METAL'
        devices.refresh_devices()
        for device in devices.devices:
            device.use = device.type == 'METAL'
        if any(device.use for device in devices.devices):
            scene.cycles.device = 'GPU'
    scene.cycles.samples = SAMPLES
    scene.cycles.adaptive_threshold = .02
    scene.cycles.use_denoising = True
    scene.cycles.denoising_input_passes = 'RGB_ALBEDO_NORMAL'
    scene.cycles.max_bounces = 6
    scene.render.use_persistent_data = True
    scene.cycles.seed = 21
    # Nothing behind the instrument: the page is black (--dark), so the frame is too, and the picture
    # has no edge on the page. Only the lights it reflects draw it: a broad softbox above for the
    # lacquer, two tall strips behind it that trace its outline, and a faint card in front.
    scene.world = bpy.data.worlds.new('Black')
    scene.world.color = (0, 0, 0)
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Medium High Contrast'
    scene.view_settings.exposure = 0
    warm, cool = (1, .93, .85), (.86, .92, 1)
    softbox('Top', (-.3, -.45, 1.6), 55, 1.6, .9, warm, (0, 0, 0))
    softbox('Band', (.6, -2.4, .25), 24, .5, 2.4, cool, (0, 0, 0))
    softbox('Rim left', (-1.3, .05, .2), 34, .4, 2.2, cool, (0, 0, 0))
    softbox('Rim right', (1.3, .1, -.15), 24, .4, 2.2, warm, (0, 0, 0))
    softbox('Card', (.35, -1.8, -.6), 6, 1.2, .9, warm, (0, 0, 0))
    for obj in scene.objects:
        if obj.type == 'LIGHT':
            obj.visible_camera = False
    distance = FRAME_WIDTH * 85 / 36
    bpy.ops.object.camera_add(location=(0, -distance, 0))
    camera = bpy.context.object
    camera.rotation_euler = (-camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.lens = 85
    camera.data.clip_end = 20
    scene.camera = camera
    scene.render.resolution_x = scene.render.resolution_y = SIZE
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGB'
    frames.mkdir(parents=True, exist_ok=True)
    output.mkdir(parents=True, exist_ok=True)
    last = FRAMES - 1
    for frame in ([0, last // 2, last] if preview else range(FRAMES)):
        path = frames / f'{frame:03d}.png'
        if path.exists():
            continue
        # The instrument turns where it stands: from lying flat, seen from a little above, to upright
        # and turned a little towards the page. Where it stands and how big is the page's business.
        progress = frame / last
        ease = progress * progress * (3 - 2 * progress)
        spin = radians(18 - 32 * ease)  # around its neck
        tilt = radians(16 * (1 - ease))  # its face leaning back, lying down
        orbit = Matrix.Rotation(tilt, 4, 'X') @ Matrix.Rotation((progress - 1) * pi / 2, 4, 'Y') @ Matrix.Rotation(spin, 4, 'Z')
        pivot.matrix_world = orbit
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
    if not preview:
        encode(name, frames, output)


def encode(name, frames, output):
    """The poses as numbered WebP stills at two sizes, each cut to the instrument (the rest of a frame is
    black, like the page), and frames.json with where each cut goes in its square frame: the page draws
    them into a canvas, and a smaller still costs less to decode, keep and draw."""
    author = 'Ryan_Nein' if name == 'pj-bass' else 'proudlove1'
    credits = Image.Exif()
    credits[315] = author
    credits[33432] = '3D model: CC BY 4.0, https://creativecommons.org/licenses/by/4.0/'
    folder = output / name
    boxes = {str(width): [] for width in WIDTHS}
    for width in WIDTHS:
        (folder / str(width)).mkdir(parents=True, exist_ok=True)
    for frame in range(FRAMES):
        still = Image.open(frames / f'{frame:03d}.png').convert('RGB')
        for width in WIDTHS:
            small = still if width == SIZE else still.resize((width, width), Image.Resampling.LANCZOS)
            lit = small.convert('L').point(lambda value: 255 if value > 2 else 0).getbbox() or (0, 0, 2, 2)
            pad = 3
            box = (max(0, lit[0] - pad), max(0, lit[1] - pad), min(width, lit[2] + pad), min(width, lit[3] + pad))
            small.crop(box).save(folder / str(width) / f'{frame:03d}.webp', quality=72, method=6, exif=credits)
            boxes[str(width)].append([box[0], box[1], box[2] - box[0], box[3] - box[1]])
    (folder / 'frames.json').write_text(json.dumps({'frames': FRAMES, 'boxes': boxes}, separators=(',', ':')))
    Image.open(frames / f'{FRAMES - 1:03d}.png').convert('RGB').resize((960, 960), Image.Resampling.LANCZOS) \
        .save(folder / 'rest.webp', quality=86, method=6, exif=credits)


if __name__ == '__main__':
    name, source, output = sys.argv[1:4]
    if name not in ('les-paul', 'pj-bass'):
        raise ValueError('Expected les-paul or pj-bass')
    with tempfile.TemporaryDirectory() as temporary:
        frames = Path(sys.argv[4] if len(sys.argv) > 4 else temporary).resolve()
        render(name, Path(source), Path(output), frames, '--preview' in sys.argv[5:])
