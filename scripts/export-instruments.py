"""The instruments for the page's WebGL scene: python export-instruments.py NAME SOURCE.glb OUTPUT.glb [GRAIN.jpg].

Exports a model ready to draw: the bass's green paint turned black (as in the studio renders), the
instrument centred, its length 1, upright along +Y and facing +Z, with WebP textures. The satin finish
is applied by the page (strings/instrument.ts), since the paint's roughness lives in a packed texture.
Compress the result afterwards with gltf-transform (meshopt), see public/music/instruments/CREDITS.md.
Runs in the same environment as render-instruments.py (bpy 4.5).
"""

import sys
from importlib import import_module
from pathlib import Path

import bpy
import bmesh
from mathutils import Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from instrument_details import bass_guard_edge, les_paul_finish, les_paul_frets, wood_grain

studio = import_module('render-instruments')


def refine_bass_body():
    """Restore a continuous surface across the body's UV seams before subdivision."""
    body = next(
        obj for obj in bpy.context.scene.objects
        if obj.type == 'MESH' and obj.data.materials[0].name == 'BodyMaterial'
    )
    mesh = body.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-6)
    bmesh.ops.join_triangles(
        bm, faces=bm.faces[:], cmp_uvs=True, angle_face_threshold=0.45, angle_shape_threshold=1.05,
    )
    for face in bm.faces:
        face.smooth = True
    bm.to_mesh(mesh)
    bm.free()
    if mesh.has_custom_normals:
        bpy.context.view_layer.objects.active = body
        bpy.ops.mesh.customdata_custom_splitnormals_clear()
    subdivision = body.modifiers.new('Rounded body contour', 'SUBSURF')
    subdivision.levels = subdivision.render_levels = 1


def bake_bass_occlusion(meshes):
    """Bake short contact shadows from the assembled instrument into the existing texture atlases."""
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 48
    materials = [bpy.data.materials[name] for name in ('BodyMaterial', 'NeckMaterial')]
    targets = []
    for mat in materials:
        tree = mat.node_tree
        output = next(n for n in tree.nodes if n.type == 'OUTPUT_MATERIAL')
        surface = output.inputs['Surface']
        original = surface.links[0].from_socket
        # Limit occlusion to 2 cm at approximately life size. The environment lights the outer curves.
        ao = tree.nodes.new('ShaderNodeAmbientOcclusion')
        ao.inputs['Distance'].default_value = .02
        ao.samples = 16
        emit = tree.nodes.new('ShaderNodeEmission')
        tree.links.new(ao.outputs['Color'], emit.inputs['Color'])
        tree.links.new(emit.outputs[0], surface)
        tex = tree.nodes.new('ShaderNodeTexImage')
        tex.image = bpy.data.images.new(mat.name + ' AO', 1024, 1024, alpha=False)
        tex.image.generated_color = (1, 1, 1, 1)
        tex.image.colorspace_settings.name = 'Non-Color'
        tree.nodes.active = tex
        targets.append((mat, surface, original, ao, emit, tex))
    bpy.ops.object.select_all(action='DESELECT')
    # Strings still cast occlusion onto their neighbours. They do not need an atlas themselves.
    receivers = [obj for obj in meshes if obj.data.materials[0] in materials]
    for obj in receivers:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = receivers[0]
    bpy.ops.object.bake(type='EMIT', use_clear=False, margin=4)
    group = bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
    group.interface.new_socket(name='Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
    for mat, surface, original, ao, emit, tex in targets:
        tree = mat.node_tree
        tree.links.new(original, surface)
        tree.nodes.remove(ao)
        tree.nodes.remove(emit)
        gltf = tree.nodes.new('ShaderNodeGroup')
        gltf.node_tree = group
        tree.links.new(tex.outputs['Color'], gltf.inputs['Occlusion'])


def export(name, source, output, grain=None):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source.resolve()))
    if name == 'pj-bass':
        studio.black_bass_finish()
        refine_bass_body()
        bass_guard_edge()
    else:
        les_paul_frets()
    if grain is not None:
        wood_grain(name, grain)
    if name == 'les-paul':
        les_paul_finish()
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    corners = [obj.matrix_world @ Vector(point) for obj in meshes for point in obj.bound_box]
    lower, upper = (Vector(fn(point[axis] for point in corners) for axis in range(3)) for fn in (min, max))
    # Blender is Z-up, the camera on -Y; glTF's +Y up and +Z front are Blender's +Z and -Y.
    up, front = ((0, 0, 1), (0, -1, 0)) if name == 'pj-bass' else ((1, 0, 0), (0, 0, 1))
    up, front = Vector(up), Vector(front)
    basis = Matrix([up.cross(front), -front, up]).to_4x4()
    normalize = Matrix.Scale(1 / max(upper - lower), 4) @ basis @ Matrix.Translation(-(lower + upper) / 2)
    for obj in [obj for obj in bpy.context.scene.objects if obj.parent is None]:
        obj.matrix_world = normalize @ obj.matrix_world
    if name == 'pj-bass':
        bpy.context.view_layer.update()
        bake_bass_occlusion(meshes)
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(output.resolve()), export_format='GLB', export_image_format='WEBP',
        export_image_quality=88, export_yup=True, export_apply=True, export_animations=False,
        export_cameras=False, export_lights=False, export_extras=False,
    )


if __name__ == '__main__':
    name, source, output = sys.argv[1:4]
    if name not in ('les-paul', 'pj-bass'):
        raise ValueError('Expected les-paul or pj-bass')
    export(name, Path(source), Path(output), Path(sys.argv[4]) if len(sys.argv) > 4 else None)
