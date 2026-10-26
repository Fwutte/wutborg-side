"""Build the Wutborg Sprint kart in Blender and export the game-ready GLB.

Run: blender --background --factory-startup --python scripts/build-kart-model.py
Coordinates in helpers match the game: X right, Y up, Z forward.
The export contains one chassis and four independent wheel pivots.
"""
from pathlib import Path
from math import sin, cos, pi
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "kart" / "blender"
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)


def xyz(p):
    return (p[0], -p[2], p[1])


def material(name, color, metallic=0, roughness=.5, emission=0, coat=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Coat Weight"].default_value = coat
    bsdf.inputs["Coat Roughness"].default_value = .18
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*color, 1)
        bsdf.inputs["Emission Strength"].default_value = emission
    return m


paint = material("Paint", (.8, .055, .025), .28, .27, coat=1)
accent = material("Accent", (1, .74, .25), .15, .35)
dark = material("Carbon", (.018, .029, .042), .24, .57)
metal = material("Alloy", (.43, .56, .63), .82, .24)
visor = material("Visor", (.018, .10, .15), .7, .16, coat=1)
rubber = material("Rubber", (.012, .016, .022), 0, .93)
light = material("Lamps", (.83, 1, .91), .25, .25, .7)
tail = material("TailLamps", (1, .035, .018), .15, .28, .8)


def empty(name, loc=(0, 0, 0)):
    o = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(o)
    o.location = xyz(loc)
    return o


chassis = empty("Chassis")


def finish(o, name, mat, parent=chassis, smooth=True):
    o.name = name
    o.data.materials.append(mat)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    o.parent = parent
    if smooth:
        for p in o.data.polygons:
            p.use_smooth = True
    return o


def box(name, mat, loc, size, bevel=.04, parent=chassis):
    bpy.ops.mesh.primitive_cube_add(size=1, location=xyz(loc))
    o = bpy.context.object
    o.scale = (size[0], size[2], size[1])
    finish(o, name, mat, parent, False)
    if bevel:
        mod = o.modifiers.new("Soft machined edges", "BEVEL")
        mod.width = bevel
        mod.segments = 2
        bpy.ops.object.modifier_apply(modifier=mod.name)
        mod = o.modifiers.new("Weighted normals", "WEIGHTED_NORMAL")
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return o


def sphere(name, mat, loc, scale, parent=chassis, segments=20, rings=12):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=1, location=xyz(loc))
    o = bpy.context.object
    o.scale = (scale[0], scale[2], scale[1])
    return finish(o, name, mat, parent)


def tube(name, mat, start, end, radius=.025, parent=chassis, vertices=8):
    a, b = Vector(xyz(start)), Vector(xyz(end))
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=(b-a).length, location=(a+b)/2)
    o = bpy.context.object
    o.rotation_euler = (b-a).to_track_quat("Z", "Y").to_euler()
    return finish(o, name, mat, parent)


def loft(name, mat, sections):
    """Rounded octagonal cross sections: forward Z, half width, bottom/top Y."""
    verts, faces = [], []
    for z, w, bottom, top in sections:
        h = top-bottom
        ring = [(-w*.78, bottom), (w*.78, bottom), (w, bottom+h*.23),
                (w, bottom+h*.64), (w*.72, top), (-w*.72, top),
                (-w, bottom+h*.64), (-w, bottom+h*.23)]
        verts.extend(xyz((x, y, z)) for x, y in ring)
    faces.append(tuple(reversed(range(8))))
    for s in range(len(sections)-1):
        for i in range(8):
            a = s*8+i
            b = s*8+(i+1)%8
            faces.append((a, b, b+8, a+8))
    faces.append(tuple(range((len(sections)-1)*8, len(sections)*8)))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    o = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(o)
    finish(o, name, mat)
    # Consistent outward normals after creating the loft.
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    return o


# Low, tapered body and sculpted nose. The open cockpit is framed by sidepods.
loft("Undertray", dark, [(-1.15,.48,.18,.28),(-.7,.65,.17,.29),(.6,.62,.18,.29),(1.35,.70,.21,.28)])
loft("Nose", paint, [(.04,.33,.29,.54),(.4,.39,.29,.62),(.95,.58,.27,.49),(1.28,.61,.27,.40),(1.36,.45,.28,.36)])
loft("Center stripe", accent, [(.23,.065,.60,.615),(.4,.065,.62,.631),(.95,.078,.49,.501),(1.28,.087,.40,.411),(1.36,.065,.36,.371)])
box("Front splitter", dark, (0,.235,1.30), (1.65,.10,.29), .025)
for side in [-1, 1]:
    pod = loft("Sidepod", paint, [(-1.02,.16,.26,.42),(-.78,.21,.25,.62),(-.15,.20,.25,.56),(.28,.12,.27,.46)])
    pod.location.x = side*.59
    box("Sill stripe", accent, (side*.79,.37,-.4), (.025,.07,.83), .012)
    box("Air intake", dark, (side*.77,.49,-.45), (.035,.16,.31), .025)
    for n in range(3):
        box("Intake louvre", metal, (side*.793,.45+n*.039,-.45), (.013,.012,.24), .004)
    box("Splitter endplate", paint, (side*.78,.30,1.28), (.07,.17,.32), .018)
    box("Headlight", light, (side*.42,.385,1.338), (.29,.045,.035), .012)
    box("Rear light", tail, (side*.49,.48,-1.04), (.23,.052,.035), .012)
    tube("Front wishbone", metal, (side*.28,.28,.42), (side*.81,.35,.77), .024)
    tube("Front wishbone", dark, (side*.30,.28,1.04), (side*.81,.35,.77), .032)
    tube("Rear axle", metal, (0,.35,-.76), (side*.86,.35,-.76), .038)
    tube("Wing mount", dark, (side*.42,.38,-.89), (side*.42,.97,-1.06), .042)
    box("Wing endplate", paint, (side*.79,1.03,-1.09), (.055,.29,.48), .025)
    # Exhausts match the existing boost effect attachment points.
    tube("Exhaust", metal, (side*.43,.42,-.94), (side*.43,.42,-1.28), .089, vertices=12)
    tube("Exhaust core", dark, (side*.43,.42,-1.282), (side*.43,.42,-1.287), .065, vertices=12)

box("Rear wing", paint, (0,1.01,-1.10), (1.61,.105,.40), .045)
box("Wing stripe", accent, (0,1.067,-1.10), (.24,.012,.32), .006)
box("Diffuser", dark, (0,.23,-1.05), (1.27,.19,.27), .025)
for x in [-.42,-.21,0,.21,.42]:
    box("Diffuser fin", dark, (x,.20,-1.17), (.035,.19,.29), .008)
box("Seat", dark, (0,.59,-.35), (.49,.23,.59), .08)
box("Seat back", dark, (0,.82,-.60), (.53,.55,.16), .065)
box("Headrest", accent, (0,1.09,-.62), (.39,.13,.13), .04)
# Roll hoop sits behind the helmet and remains visible from the chase camera.
for side in [-1,1]:
    tube("Roll hoop", metal, (side*.31,.60,-.64), (side*.31,1.20,-.64), .033)
tube("Roll hoop", metal, (-.31,1.20,-.64), (.31,1.20,-.64), .033)

# Driver: fitted suit, shoulder pads, gloves and a continuous dark visor patch.
sphere("Driver suit", accent, (0,.96,-.20), (.235,.33,.22))
for side in [-1,1]:
    tube("Harness", dark, (side*.09,1.16,-.02), (side*.11,.78,.01), .026)
    tube("Sleeve", accent, (side*.22,1.12,-.12), (side*.27,.97,.29), .085, vertices=10)
    sphere("Glove", dark, (side*.25,.96,.29), (.10,.09,.10), segments=12, rings=8)
    sphere("Helmet ear", dark, (side*.325,1.47,-.15), (.032,.09,.09), segments=12, rings=8)
sphere("Helmet", paint, (0,1.49,-.15), (.345,.35,.32), segments=24, rings=16)
# A curved sphere patch instead of a complete shell avoids a visor at the back.
verts, faces = [], []
for j in range(6):
    lat = -.19+j*.095
    for i in range(17):
        a = -1.32+i*2.64/16
        verts.append(xyz((.350*cos(lat)*sin(a),1.49+.355*sin(lat),-.15+.328*cos(lat)*cos(a))))
for j in range(5):
    for i in range(16):
        a=j*17+i
        faces.append((a,a+1,a+18,a+17))
mesh=bpy.data.meshes.new("Wraparound visor")
mesh.from_pydata(verts,[],faces)
mesh.update()
o=bpy.data.objects.new("Wraparound visor",mesh)
bpy.context.collection.objects.link(o)
finish(o,"Wraparound visor",visor)
# Crest and rear helmet band make the driver's colors readable at racing distance.
verts,faces=[],[]
for i in range(25):
    a=-1.05+i*2.10/24
    for x in [-.045,.045]:
        verts.append(xyz((x,1.49+.355*cos(a)*.992,-.15+.330*sin(a)*.992)))
for i in range(24):
    a=i*2
    faces.append((a+1,a,a+2,a+3))
mesh=bpy.data.meshes.new("Helmet stripe")
mesh.from_pydata(verts,[],faces);mesh.update()
o=bpy.data.objects.new("Helmet stripe",mesh);bpy.context.collection.objects.link(o)
finish(o,"Helmet stripe",accent)
tube("Steering column",metal,(0,.65,.35),(0,.94,.34),.025)
bpy.ops.mesh.primitive_torus_add(major_segments=20,minor_segments=6,location=xyz((0,.97,.34)),major_radius=.19,minor_radius=.025)
o=bpy.context.object
o.rotation_euler.x=.95
finish(o,"Steering wheel",dark)

# All wheel meshes are local to the pivot. Axis X is shared with the runtime.
for front,z in [(True,.77),(False,-.76)]:
    for side in [-1,1]:
        name="Wheel_"+("F" if front else "R")+("L" if side<0 else "R")
        pivot=empty(name,(side*.83,.35,z))
        width=.24 if front else .31
        # Rounded tyre profile revolved around X; no disconnected tread blocks.
        profile=[(-width/2,.235),(-width/2,.290),(-width*.35,.342),
                 (width*.35,.342),(width/2,.290),(width/2,.235)]
        verts,faces=[],[]
        for x,r in profile:
            verts.extend(xyz((x,r*cos(i*2*pi/24),r*sin(i*2*pi/24))) for i in range(24))
        for j in range(len(profile)):
            for i in range(24):
                a=j*24+i;b=j*24+(i+1)%24;c=((j+1)%len(profile))*24+(i+1)%24;d=((j+1)%len(profile))*24+i
                faces.append((a,b,c,d))
        mesh=bpy.data.meshes.new("Tyre")
        mesh.from_pydata(verts,[],faces);mesh.update()
        o=bpy.data.objects.new("Tyre",mesh);bpy.context.collection.objects.link(o)
        finish(o,"Tyre",rubber,pivot)
        for face_side in [-1,1]:
            x=face_side*(width/2+.003)
            tube("Rim barrel",metal,(x-.014,0,0),(x+.014,0,0),.224,pivot,24)
            tube("Brake disc",dark,(x+face_side*.016,0,0),(x+face_side*.019,0,0),.185,pivot,20)
            for n in range(6):
                a=n*2*pi/6
                tube("Forged spoke",metal,(x+face_side*.025,.045*cos(a),.045*sin(a)),(x+face_side*.025,.195*cos(a+.15),.195*sin(a+.15)),.024,pivot,6)
            tube("Hub",metal,(x,0,0),(x+face_side*.04,0,0),.064,pivot,12)
            # Six inset tyre marks also make wheel rotation visible.
            for n in range(6):
                a=n*2*pi/6
                tube("Sidewall mark",accent,(x,.275*cos(a),.275*sin(a)),(x,.295*cos(a),.295*sin(a)),.009,pivot,5)

# Merge by material inside each movable part: compact draw count, editable source.
for parent in [chassis]+[o for o in bpy.data.objects if o.name.startswith("Wheel_")]:
    for mat in [paint,accent,dark,metal,visor,rubber,light,tail]:
        meshes=[o for o in parent.children if o.type=="MESH" and o.data.materials[0]==mat]
        if not meshes:
            continue
        bpy.ops.object.select_all(action="DESELECT")
        for o in meshes:
            o.select_set(True)
        bpy.context.view_layer.objects.active=meshes[0]
        if len(meshes)>1:
            bpy.ops.object.join()
        merged=bpy.context.object
        merged.name=parent.name+"_"+mat.name
        # Bake origin to the parent so all wheel submeshes rotate together.
        bpy.context.scene.cursor.location=parent.matrix_world.translation
        bpy.ops.object.origin_set(type="ORIGIN_CURSOR")

bpy.context.scene.cursor.location=(0,0,0)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/"wutborg-sprint.blend"),compress=True)
bpy.ops.export_scene.gltf(filepath=str(OUT/"wutborg-sprint.glb"),export_format="GLB",
    export_yup=True,export_apply=True,export_cameras=False,export_lights=False,
    export_extras=False,export_texcoords=False,export_normals=True,
    export_animations=False,export_materials="EXPORT")
print("WUTBORG_MODEL_READY",(OUT/"wutborg-sprint.glb").stat().st_size)
