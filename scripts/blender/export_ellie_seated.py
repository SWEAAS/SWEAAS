"""
Export Ellie as ellie-seated.glb for the HQ 3D experience.

WHAT IT DOES
------------
1. Opens ellie_animation.blend (Blender Studio's Charge demo Ellie rig).
2. Selects the Ellie armature + mesh.
3. Bakes the currently-selected action onto the armature so IK/FK
   constraints, drivers, and driver-driven shape keys survive the glTF
   exporter (they do NOT export otherwise).
4. Writes a compressed GLB with Draco geometry compression and only the
   deform bones to frontend/public/models/characters/ellie-seated.glb.

HOW TO RUN
----------
Blender 4.x:
    blender --background ellie_animation.blend \
        --python scripts/blender/export_ellie_seated.py \
        -- --output frontend/public/models/characters/ellie-seated.glb

Or interactively: open ellie_animation.blend in Blender, pick the seated
typing clip in the Action Editor, open the Scripting workspace, open this
file, hit Run Script.

Before running, ensure the rig's Action Editor has the desired clip
selected — the bake operates on the currently-active action.

WHAT IT DOES NOT DO
-------------------
- Pick the "right" animation for you. Open the .blend first, use the Action
  Editor or Asset Browser to select a seated typing clip, then run this
  script.
- Downsize the mesh. If the GLB is >15 MB, decimate the mesh in Blender
  (Modifiers → Decimate, ratio ~0.5) and re-run.
"""

import argparse
import os
import sys

import bpy

DEFAULT_OUTPUT = os.path.join(
    "frontend", "public", "models", "characters", "ellie-seated.glb"
)


def parse_args():
    argv = sys.argv
    if "--" in argv:
        argv = argv[argv.index("--") + 1 :]
    else:
        argv = []
    p = argparse.ArgumentParser()
    p.add_argument("--output", default=DEFAULT_OUTPUT,
                   help="Output GLB path (relative to CWD).")
    p.add_argument("--frame-start", type=int, default=None,
                   help="First frame of the bake range. Defaults to scene start.")
    p.add_argument("--frame-end", type=int, default=None,
                   help="Last frame of the bake range. Defaults to scene end.")
    return p.parse_args(argv)


def find_armature_and_mesh():
    armature = None
    meshes = []
    for obj in bpy.context.scene.objects:
        if obj.type == "ARMATURE" and armature is None:
            armature = obj
        elif obj.type == "MESH":
            if any(m.type == "ARMATURE" for m in obj.modifiers):
                meshes.append(obj)
    return armature, meshes


def main():
    args = parse_args()
    output = os.path.abspath(args.output)
    os.makedirs(os.path.dirname(output), exist_ok=True)

    armature, meshes = find_armature_and_mesh()
    if armature is None:
        raise SystemExit("No armature found in the current .blend")
    if not meshes:
        raise SystemExit("No armature-skinned meshes found")

    print(f"Armature: {armature.name}")
    print(f"Meshes: {[m.name for m in meshes]}")

    scene = bpy.context.scene
    fs = args.frame_start if args.frame_start is not None else scene.frame_start
    fe = args.frame_end if args.frame_end is not None else scene.frame_end
    print(f"Baking frames {fs}..{fe}")

    # Enter pose mode and bake visual keying so IK/constraints / drivers are
    # resolved to plain transform keyframes. Without this, rigify-style rigs
    # explode at runtime because the glTF exporter ignores constraints and
    # drivers.
    bpy.ops.object.select_all(action="DESELECT")
    armature.select_set(True)
    bpy.context.view_layer.objects.active = armature
    bpy.ops.object.mode_set(mode="POSE")
    bpy.ops.pose.select_all(action="SELECT")
    bpy.ops.nla.bake(
        frame_start=fs,
        frame_end=fe,
        only_selected=False,
        visual_keying=True,
        clear_constraints=True,
        clear_parents=False,
        use_current_action=True,
        bake_types={"POSE"},
    )
    bpy.ops.object.mode_set(mode="OBJECT")

    # Select everything we want to export and nothing else.
    bpy.ops.object.select_all(action="DESELECT")
    armature.select_set(True)
    for m in meshes:
        m.select_set(True)
    bpy.context.view_layer.objects.active = armature

    bpy.ops.export_scene.gltf(
        filepath=output,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_animations=True,
        export_force_sampling=True,
        export_nla_strips=False,
        export_def_bones=True,           # deform bones only
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
        export_draco_position_quantization=14,
        export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=12,
        export_image_format="AUTO",
        export_materials="EXPORT",
        export_extras=False,
    )
    size_mb = os.path.getsize(output) / 1024 / 1024
    print(f"Wrote {output} ({size_mb:.2f} MB)")


if __name__ == "__main__":
    main()
