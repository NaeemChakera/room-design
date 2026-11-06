# Roomcraft

Trace your room into a floor plan, then let the app design it: furniture, framed art, floating shelves, plants, lamps and rugs, laid out by interior-design rules and shown as a floor plan and a 3D view.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # design-engine tests
npm run build    # static site in dist/
```

## Publish on GitHub Pages

The workflow in `.github/workflows/pages.yml` runs the tests, builds the site and deploys it whenever you push. Turn it on once:

1. In the repo on GitHub, open **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Push a commit, or run the workflow from the **Actions** tab.

The site goes live at `https://<your-username>.github.io/room-design/`.

## How it works

1. **Trace the room.** Tap the corners on the grid. Lines snap to right angles and the first corner closes the shape. Then drag corners, drag the dot on a wall to push the whole wall, double-tap a wall to add a corner, or type exact lengths (`12' 6"`, `3.8 m`, `420cm`). You can also trace over a photo of a floor plan or a sketch, then use **Set scale** on one wall you know.
2. **Doors and windows.** Pick Door, Open doorway or Window and tap a wall. You can set the width, distance from the corner, sill height and hinge side.
3. **Design.** Pick a room type (living, bedroom, office, dining) and a style. Three of the styles come from Pinterest Predicts 2026: Afrohemian, Neo Deco and Throwback 60s. The engine runs about 70 randomized layouts and keeps the best distinct ones.

If a room includes your own furniture (like the preset of Naeem's bedroom), **Keep my furniture** leaves every piece where you planned it and only suggests things to add around it.

### The design engine (`src/designer.js`)

- Each piece of furniture gets candidate spots, mostly with its back against a wall. A spot is rejected if it's outside the room, overlaps something, sits in a door swing, blocks another piece's clearance (wardrobe doors, dresser drawers) or would hit an open door leaf.
- The remaining spots are scored with design rules:
  - TV viewing distance of about 2.8 m.
  - Bed in the "command position": you can see the door from bed, and the headboard isn't under a window.
  - Desk gets side daylight and the door isn't directly behind you.
  - Plants go near windows, lamps go in the darkest corners.
  - Tall storage stays off windows.
  - Frames are hung as a group over the sofa, bed or dresser.
  - Shelves never go above walkways.
- Each finished layout is checked by a **walkway flood fill** from the doors. Every sofa, bed side, wardrobe and chair has to be reachable along a 56 cm path. The score also counts open floor and a light-coverage estimate.

## Files

| File | What it does |
| --- | --- |
| `src/main.js` | UI, tracing editor, steps |
| `src/geometry.js` | Polygons, oriented boxes, collision tests, ray casts |
| `src/catalog.js` | Furniture sizes, styles, inspiration notes |
| `src/designer.js` | Layout engine and scoring |
| `src/render2d.js` | Top-down plan drawing |
| `src/view3d.js` | three.js dollhouse view (walls nearest the camera are cut away automatically) |
| `src/presets.js` | Sample rooms, including Naeem's bedroom from the hand-span measurements |

## Ideas for later

- Scan the room with the phone: iOS RoomPlan (LiDAR) or ARCore depth, exported to this outline format.
- Drag furniture around by hand in the design step.
- Product links for each item.
