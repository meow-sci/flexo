# Connector Types

Connectors define how parts attach to other parts in KSA assemblies. Each connector type has specific attachment rules.

## Default (no flag)

**Behavior:** Bidirectional connector-to-connector attachment.

A part with a default connector can attach to any other part with a default connector. This is the standard attachment mode for most radial and axial connections.

## Internal

**Behavior:** Marks a connector as internal to prevent unintended self-attachment.

When `ConnectorTyping` is enabled, two internal connectors cannot attach to each other. Used for recessed mounting points (e.g., engine attachment seats on fuel tanks) where surface-to-surface contact is desired but connector-to-connector contact would cause visual artifacts (z-fighting). Currently not enabled by default.

## ToSurface

**Behavior:** Unidirectional surface attachment. This connector attaches *to* external surfaces only.

The part positions itself so the connector point contacts the target part's surface. Default connector-to-connector attachment is disabled. Used for parts that mount perpendicular to surfaces, like RCS thrusters.

## FromSurface

**Behavior:** Unidirectional surface attachment. Other parts attach *from their surfaces* to this connector.

Other parts can mount their surfaces against this connector point. Default connector-to-connector attachment is disabled. Does not support sliding/repositioning along the surface during attachment. Primary use: radial decoupler.

---

**Enable/disable connectors:** Toggle with "Enable Connecting" in the Debug Editor to show/hide attachment UI. 
