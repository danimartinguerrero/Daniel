"""Surface details for the two stock instrument meshes, applied once during export."""

import io
from math import cos, pi, sin
from pathlib import Path
from tempfile import TemporaryDirectory

import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from PIL import Image, ImageDraw, ImageFilter, ImageFont


def wood_grain(name, photo):
    """Retain the maker's lettering, bindings and inlays while grading the wood in its original UVs."""
    bass = name == 'pj-bass'
    material = bpy.data.materials['NeckMaterial' if bass else 'MainBake']
    surface = material.node_tree.nodes.get('Principled BSDF')
    image = surface.inputs['Base Color'].links[0].from_node.image
    original = Image.open(io.BytesIO(image.packed_file.data)).convert('RGB')
    base = np.asarray(original, dtype=float)
    red, green, blue = base.transpose(2, 0, 1)
    y, x = np.indices(red.shape)
    u, v = x / original.width, y / original.height
    if bass:
        # The maple neck, board and headstock share the left-hand side of this atlas.
        wood = (u < .30) & (red > 1.12 * green) & (green > 1.16 * blue) & (red > 70)
        grade = [1.0, .91, .79]
    else:
        wood = (u > .88) & (u < .97) & (v > .04) & (v < .79) & (red > 1.16 * green) & (red < 155)
        grade = [1.13, .97, .86]

    scan = Image.open(photo).convert('L').transpose(Image.Transpose.ROTATE_90)
    # A roughly half-metre cut of the scanned sheet runs from the nut to the heel.
    scan = np.asarray(scan, dtype=float)
    grain = scan[(y * 1.25).astype(int) % scan.shape[0], (x * 1.25).astype(int) % scan.shape[1]]
    variation = np.clip((grain - np.median(scan)) / max(1, np.std(scan)), -2.5, 2.5)
    base[wood] *= np.array(grade) * (1 + (.085 if bass else .15) * variation[wood, None])
    if not bass:
        # Pearloid markers vary in translucency across the sheet. Restrict the mottling to the
        # trapezoids, leaving fret stripes, lettering and the cream binding in the authored atlas.
        shell = (u > .888) & (u < .964) & (v > .044) & (v < .78) & (red > 222) & (green > 210)
        rng = np.random.default_rng(83)
        chips = Image.fromarray(rng.integers(0, 256, (136, 108), dtype=np.uint8)).resize(
            original.size, Image.Resampling.BICUBIC,
        )
        broad = np.asarray(chips.filter(ImageFilter.GaussianBlur(3)), dtype=float) / 255
        veins = .5 + .5 * np.sin(.23 * x + .14 * y + 9 * broad)
        lustre = (.74 + .22 * broad + .065 * veins)[shell]
        base[shell] *= lustre[:, None] * [1.0, 1.015, 1.023]
    data = io.BytesIO()
    Image.fromarray(np.clip(base, 0, 255).astype('uint8')).save(data, 'PNG')
    image.pack(data=data.getvalue(), data_len=data.tell())


def bass_guard_edge():
    """Assign the middle ply of the stock pickguard bevel, in the source model's coordinates."""
    guard = bpy.data.objects['Object_3']
    edge = bpy.data.materials.new('Pickguard centre ply')
    edge.use_nodes = True
    surface = edge.node_tree.nodes.get('Principled BSDF')
    surface.inputs['Base Color'].default_value = (.009, .008, .007, 1)
    surface.inputs['Roughness'].default_value = .35
    guard.data.materials.append(edge)
    for face in guard.data.polygons:
        point = guard.matrix_world @ face.center
        if point.z < 0 and -.02358 < point.y < -.02312:
            face.material_index = len(guard.data.materials) - 1


def les_paul_frets():
    """Crown each fret at the metal stripe in the source atlas, following the actual neck radius."""
    neck = next(obj for obj in bpy.context.scene.objects if obj.type == 'MESH' and obj.name.startswith('Neck_med'))
    board = BVHTree.FromPolygons(
        [neck.matrix_world @ vertex.co for vertex in neck.data.vertices],
        [face.vertices[:] for face in neck.data.polygons],
    )

    def top(x, y):
        return board.ray_cast(Vector((x, y, 200)), Vector((0, 0, -1)))[0]

    # Longitudinal centres sampled from the authored metallic map, in unscaled source units.
    centres = (172.75, 194.75, 218.25, 243.25, 269.75, 298.75, 329.25, 360.75,
               393.75, 429.5, 467.75, 508.75, 550.75, 596.5, 644.75, 694.75,
               748.75, 807.25, 867.75, 932.25, 1000.5, 1073.75)
    vertices, faces = [], []
    segments = 8
    for x in centres:
        # Find the binding and inset the fret ends slightly, as on the bound fingerboard.
        lo, hi = 0, 70
        for _ in range(14):
            mid = (lo + hi) / 2
            if top(x, mid) is None:
                hi = mid
            else:
                lo = mid
        width = lo - 2.5
        start = len(vertices)
        for ring, y in enumerate((-width, -width + 2, -.5 * width, 0, .5 * width, width - 2, width)):
            height = top(x, y).z
            bevel = .2 if ring in (0, 6) else 1
            for side in range(segments + 1):
                angle = pi * side / segments
                vertices.append((x + 2.45 * cos(angle), y, height + .08 + 1.95 * sin(angle) * bevel))
            if ring:
                for side in range(segments):
                    j = start + ring * (segments + 1) + side
                    faces.append((j, j + 1, j - segments, j - segments - 1))
    mesh = bpy.data.meshes.new('Fret crowns')
    mesh.from_pydata(vertices, [], faces)
    for face in mesh.polygons:
        face.use_smooth = True
    nickel = bpy.data.materials.new('Nickel silver')
    nickel.use_nodes = True
    surface = nickel.node_tree.nodes.get('Principled BSDF')
    surface.inputs['Base Color'].default_value = (.69, .64, .54, 1)
    surface.inputs['Metallic'].default_value = 1
    surface.inputs['Roughness'].default_value = .26
    mesh.materials.append(nickel)
    bpy.context.collection.objects.link(bpy.data.objects.new('Fretwire', mesh))

def top_hat_knobs():
    """Print one shared dial on the sloped skirts of the four black top-hat knobs."""
    size = 512
    dial = Image.new('RGB', (size, size), (21, 19, 17))
    draw = ImageDraw.Draw(dial)
    font = ImageFont.load_default(size=32)
    ink = (220, 212, 192)
    for mark in range(21):
        angle = (-145 + mark * 14.5) * pi / 180
        def point(radius):
            return (256 + radius * sin(angle), 256 - radius * cos(angle))
        draw.line((point(224 if mark % 2 else 219), point(233)), fill=ink, width=3)
        if mark % 2 == 0:
            # Orient individual numerals along the skirt, as on a rotary dial.
            glyph = Image.new('RGBA', (60, 50))
            ImageDraw.Draw(glyph).text((30, 25), str(mark // 2), font=font, anchor='mm', fill=ink)
            glyph = glyph.rotate(-angle * 180 / pi, resample=Image.Resampling.BICUBIC)
            x, y = point(194)
            dial.paste(glyph, (round(x - 30), round(y - 25)), glyph)
    with TemporaryDirectory() as tempdir:
        path = Path(tempdir) / 'Control dial.png'
        dial.save(path)
        image = bpy.data.images.load(str(path))
        image.pack()

    plastic = bpy.data.materials.new('Black top hat')
    plastic.use_nodes = True
    tree = plastic.node_tree
    surface = tree.nodes.get('Principled BSDF')
    surface.inputs['Roughness'].default_value = .28
    surface.inputs['Coat Weight'].default_value = .48
    surface.inputs['Coat Roughness'].default_value = .17
    texture = tree.nodes.new('ShaderNodeTexImage')
    texture.image = image
    tree.links.new(texture.outputs['Color'], surface.inputs['Base Color'])

    knobs = sorted((obj for obj in bpy.context.scene.objects if obj.type == 'MESH'
                    and obj.name.startswith('KnobTrans_med')), key=lambda obj: obj.name)
    for knob, setting in zip(knobs, (.18, .70, -.16, .42)):
        mesh = knob.data
        mesh.materials[0] = plastic
        for loop in mesh.loops:
            x, _, z = mesh.vertices[loop.vertex_index].co
            # The shaft is local Y; each control has an independent setting.
            mesh.uv_layers.active.data[loop.index].uv = (
                .5 + (x * cos(setting) - z * sin(setting)) / .52,
                .5 + (x * sin(setting) + z * cos(setting)) / .52,
            )


def les_paul_finish():
    """Separate the lacquered body from the oiled fingerboard and finish the four controls."""
    body = next(obj for obj in bpy.context.scene.objects if obj.type == 'MESH' and obj.name.startswith('Body_med'))
    lacquer = body.data.materials[0].copy()
    lacquer.name = 'Ebony lacquer'
    surface = lacquer.node_tree.nodes.get('Principled BSDF')
    surface.inputs['Coat Weight'].default_value = .24
    surface.inputs['Coat Roughness'].default_value = .28
    body.data.materials[0] = lacquer

    top_hat_knobs()
