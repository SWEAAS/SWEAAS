# Blender export helpers for the HQ 3D experience

Two GLBs drive the realistic office workers in `/welcome-hw`:

| File | Path | Purpose |
| ---- | ---- | ---- |
| Ellie (CTO hero) | `frontend/public/models/characters/ellie-seated.glb` | Rendered at the CTO's desk |
| Worker (rank-and-file) | `frontend/public/models/characters/worker-seated.glb` | Rendered at every other desk |

Both are optional — if they're missing the app falls back to the upgraded
procedural seated figure (still looks like someone at a desk, just less
realistic than a proper rigged character).

---

## ellie-seated.glb (CTO)

**Source:** `ellie-pose-library-v2.0.0.zip` → `ellie_animation.blend`
(Blender Studio's Charge demo bundle).

**Steps:**

1. Open `ellie_animation.blend` in Blender 4.x.
2. In the Action Editor (or Asset Browser → Actions), pick one seated
   typing / seated idle clip. Push it onto the armature as the active
   action. Scrub the timeline to verify it loops.
3. In the Outliner, ensure the armature + the Ellie mesh are the only
   objects you care about. Hide or delete lights, cameras, and other
   helpers.
4. Run the export script from a terminal in the repo root:

   ```bash
   blender --background ~/path/to/ellie_animation.blend \
     --python scripts/blender/export_ellie_seated.py \
     -- --output frontend/public/models/characters/ellie-seated.glb
   ```

   Or interactively: open the Scripting workspace, open
   `scripts/blender/export_ellie_seated.py`, hit **Run Script**.

5. Verify the GLB in https://gltf-viewer.donmccurdy.com — drag the file
   in, confirm the character poses and animates.

**What the script does (and why):**

- Bakes the active action with `visual_keying=True, clear_constraints=True`.
  This resolves IK/FK constraints and drivers into plain keyframes.
  Without this step, Rigify-style rigs explode at runtime because the
  glTF exporter silently drops constraints and drivers.
- Selects only the armature + its skinned meshes before export, so Blender
  doesn't smuggle in cameras/lights/helpers.
- Exports with Draco compression (level 6) and `export_def_bones=True` so
  the 100+ control/helper bones don't ship to the browser.
- Target size is 5–10 MB. If you're above 15 MB, add a Decimate modifier
  to the mesh (ratio ≈ 0.5) and re-export.

---

## worker-seated.glb (staff)

**Source:** [Mixamo](https://www.mixamo.com) — Adobe's free rigged
character library.

**Steps:**

1. On mixamo.com, download `Y Bot` as FBX (T-pose, 30fps, no animation).
2. Download two animations applied to the Y Bot: **Sitting Typing** and
   **Sitting Idle** (FBX, 30fps, In Place, "Without Skin" for the
   second one).
3. In Blender:
   - Import the T-pose Y Bot (`File → Import → FBX`).
   - Import the two animations (Without Skin) — they add actions to the
     Y Bot armature.
   - In the NLA Editor, push the **Sitting Typing** action down to a
     strip. Loop it so it's 2–4 seconds long and ends where it starts.
   - Optionally push **Sitting Idle** too for variety (the runtime
     picks one at random).
4. Run the same script with a different output path:

   ```bash
   blender --background your-ybot.blend \
     --python scripts/blender/export_ellie_seated.py \
     -- --output frontend/public/models/characters/worker-seated.glb
   ```

The script is written against the common "rig + skinned mesh in a .blend"
pattern and works for both. Rename if you prefer a dedicated wrapper.

---

## Gotchas

- **Drivers don't export.** If a shape key is driven by a bone (common on
  Blender Studio rigs), it will stay at its rest value in the browser.
  Either delete the driver and bake the shape key onto the mesh, or
  accept the static expression.
- **Custom bone shapes are huge.** They're object metadata you don't
  need at runtime. The `export_def_bones=True` flag skips them.
- **cm vs m scale.** Mixamo FBX is in cm; Blender interprets that as m
  by default, producing 100× too-large characters. In the Import FBX
  dialog, set *Scale* to 0.01, *Apply Unit* checked.
- **Re-retargeting a non-Mixamo rig to Mixamo anims:** if you want to
  use Ellie's mesh with Mixamo anims, upload Ellie's T-posed mesh to
  Mixamo's Auto-Rigger. It's faster than manual retargeting.
