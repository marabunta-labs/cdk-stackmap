# CDK Stack Map

**Visualize your AWS CDK infrastructure instantly within VS Code.**

CDK Stack Map turns your CloudFormation templates and CDK assemblies into interactive, force-directed graphs. It helps developers understand complex infrastructure relationships, debug connections, and generate documentation assets without leaving the editor.

## Features

### 🚀 Interactive Visualization
* **Physics-Based Grouping:** Resources are visually grouped inside their parent **Stacks**. The Stacks dynamically resize to fit their content.
* **Draggable Nodes:** distinct "elastic" effect allows you to drag nodes to reorganize the view, with the parent Stack stretching to follow.
* **Force-Directed Layout:** Watch your infrastructure "untangle" itself. Nodes naturally repel each other while connections pull related resources together.

### 🔍 Smart Filtering & Navigation
* **Category Filters:** Toggle visibility for entire categories (Compute, Database, Security, etc.) to focus on specific subsystems.
* **Minimap:** Navigate large infrastructures easily with a real-time minimap.

### 📸 Export & Share
* **Export to PNG:** Generate high-resolution images of your architecture.
* **Export to SVG:** Get scalable vector graphics for professional presentations or documentation.

## How to Use

1.  Open a folder containing an AWS CDK project.
2.  Run `cdk synth` in your terminal to generate the CloudFormation assets (if you haven't already).
3.  Launch the visualization:
    * **Via Command:** Open the Command Palette (`Ctrl+Shift+P`) and run `CDK Stack Map: Visualize`.
    * **Via Sidebar:** Click the extension icon in the Activity Bar and click the **Visualize** button (or the 📶 icon).
4.  Interact with the graph:
    * **Scroll** to Zoom.
    * **Click & Drag** on the background to Pan.
    * **Drag Nodes** to rearrange them manually.
    * Use the **UI Panel** (top-left) to filter resources or download images.

## Extension Settings

You can configure the behavior of the visualization via VS Code Settings (`File > Preferences > Settings`).

| Setting | Default | Description |
| :--- | :--- | :--- |
| `cdk-stackmap.graphAreaSize` | `M` | **Canvas Size**. Choose from `XS` to `XXL`. Larger sizes give more space for massive stacks to untangle but may require more zooming. |
| `cdk-stackmap.showMinimap` | `true` | Show or hide the navigation minimap in the bottom-right corner. |
| `cdk-stackmap.nodeColorMode` | `fill` | **Fill**: Nodes are solid colored. **Border**: Nodes are dark with colored borders (high contrast). |

## Requirements

* This extension parses the `cdk.out` directory or synthesized CloudFormation templates. You must have a valid CDK project and run `cdk synth` for the visualization to work.

## Known Issues

* Extremely large stacks (500+ resources) may take a few seconds to stabilize the physics simulation initially.
* If you push a stack against the border it compresses, but will expand if you drag a node inside.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request or open an issue on GitHub.

---

## Release Notes

### 1.0.0
* Initial release.

---

**Enjoying CDK Stack Map?**
Please leave a review or star the repository on GitHub!

## Credits

Created by **[Marabunta Labs](https://github.com/marabunta-labs)**.
