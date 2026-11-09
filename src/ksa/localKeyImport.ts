import type {
  EditingPart,
  IvaSeat,
  PartGameData,
  PartLight,
  RawXmlNode,
  SubPartIdRef,
} from './types';

type ImportGame = Pick<
  PartGameData,
  | 'controllable'
  | 'controlKey'
  | 'tanks'
  | 'batteries'
  | 'generators'
  | 'solarPanels'
  | 'powerConsumer'
  | 'decoupler'
  | 'dockingPort'
  | 'evaDoor'
  | 'rocketControllers'
  | 'rockets'
  | 'combustors'
  | 'thermalCores'
  | 'antimatterRamCores'
  | 'solidMotors'
  | 'nozzles'
  | 'magneticNozzles'
  | 'solidNozzles'
  | 'magneticScoops'
  | 'solidGrainSegments'
  | 'gimbals'
  | 'consumerFeedWiring'
  | 'unknownChildren'
> & { unknownComponents?: RawXmlNode[] };

type Group = 'components' | 'cores' | 'nozzles' | 'rockets' | 'controllers' | 'gimbals';
type Maps = Record<Group, Map<string, string>>;
const norm = (key: string) => key.toLowerCase();

/** Allocate a placement key across the whole array, independent of template spelling. */
export function nextPlacementKey(
  placements: readonly { instanceId: string; subPartTemplateId: string }[],
  templateId: string,
): string {
  const base = (templateId.split('.').pop() ?? templateId).toLowerCase();
  const used = new Set(placements.map((p) => p.instanceId.toLowerCase()));
  let index =
    placements.filter((p) => p.subPartTemplateId.toLowerCase() === templateId.toLowerCase())
      .length + 1;
  while (used.has(`${base}_${index}`)) index++;
  return `${base}_${index}`;
}

/** Assign distinct keys in each native array, including default ModuleBase keys. */
export function remapImportedLocalKeys<T extends ImportGame>(
  target: EditingPart,
  input: T,
  seats: IvaSeat[],
  lights: PartLight[],
): { game: T; seats: IvaSeat[]; lights: PartLight[] } {
  const game = structuredClone(input);
  // The editor exposes these components as singletons. Preserve later imports as
  // raw Components items so their native keyed modules are not discarded.
  const extra: RawXmlNode[] = game.unknownComponents ?? [];
  const node = (
    tag: string,
    attrs: Record<string, string>,
    children: RawXmlNode[] = [],
  ): RawXmlNode => ({ tag, attrs, children });
  if (target.gameData.controllable && game.controllable) {
    extra.push(node('Control', game.controlKey ? { Key: game.controlKey } : {}));
    game.controllable = false;
  }
  if (target.gameData.powerConsumer && game.powerConsumer) {
    const pc = game.powerConsumer;
    extra.push(
      node(
        'PowerConsumer',
        {
          ...(pc.ksaId ? { Key: pc.ksaId } : {}),
          ...(pc.lightSwitch ? { LightSwitch: 'true' } : {}),
          ...(pc.lightIsActive ? { LightIsActive: 'true' } : {}),
        },
        [node('Consumed', { W: String(pc.consumedWatts) })],
      ),
    );
    game.powerConsumer = null;
  }
  if (target.gameData.decoupler && game.decoupler) {
    const d = game.decoupler;
    extra.push(
      node('Decoupler', { ...(d.ksaId ? { Key: d.ksaId } : {}), Force: String(d.force) }, [
        node('Connector', { KeyRef: d.connectorId }),
      ]),
    );
    game.decoupler = null;
  }
  if (target.gameData.dockingPort && game.dockingPort) {
    const d = game.dockingPort;
    extra.push(
      node('DockingPort', d.ksaId ? { Key: d.ksaId } : {}, [
        node('Connector', { KeyRef: d.connectorId }),
        node('LatchingKineticEnergy', { J: String(d.latchingKineticEnergyJ) }),
        node('PushoffImpulse', { Ns: String(d.pushoffImpulseNs) }),
      ]),
    );
    game.dockingPort = null;
  }
  if (target.gameData.evaDoor && game.evaDoor) {
    extra.push(
      node('EVADoor', {
        ...(game.evaDoor.ksaId ? { Key: game.evaDoor.ksaId } : {}),
        ...(game.evaDoor.seatId ? { SeatId: game.evaDoor.seatId } : {}),
      }),
    );
    game.evaDoor = null;
  }
  game.unknownComponents = extra;
  const incomingSeats = structuredClone(seats);
  const incomingLights = structuredClone(lights);
  const maps: Maps = {
    components: new Map(),
    cores: new Map(),
    nozzles: new Map(),
    rockets: new Map(),
    controllers: new Map(),
    gimbals: new Map(),
  };
  const used: Record<Group, Set<string>> = {
    components: new Set(),
    cores: new Set(),
    nozzles: new Set(),
    rockets: new Set(),
    controllers: new Set(),
    gimbals: new Set(),
  };
  const remember = (group: Group, key: string) => {
    if (key) used[group].add(norm(key));
  };
  const reserve = (group: Group, old: string): string => {
    const key = old || 'Item';
    let next = key;
    let suffix = 2;
    while (used[group].has(norm(next))) next = `${key}_${suffix++}`;
    used[group].add(norm(next));
    maps[group].set(norm(key), next);
    return next;
  };
  const existing = target.gameData;
  for (const tank of existing.tanks) remember('components', tank.id || 'Tank');
  for (const [index, b] of existing.batteries.entries())
    remember('components', b.ksaId || (index ? `Battery${index + 1}` : 'Battery'));
  for (const [index, g] of existing.generators.entries())
    remember('components', g.ksaId || (index ? `Generator${index + 1}` : 'Generator'));
  for (const [index, sp] of existing.solarPanels.entries())
    remember('components', sp.ksaId || (index ? `SolarPanel${index + 1}` : 'SolarPanel'));
  for (const m of [...existing.solidGrainSegments, ...existing.magneticScoops])
    remember('components', m.id);
  if (existing.powerConsumer)
    remember('components', existing.powerConsumer.ksaId || 'PowerConsumer');
  if (existing.controllable) remember('components', existing.controlKey || 'Control');
  // The serializer reserves this key for the merged root collider component.
  remember('components', 'flexoColliders');
  if (existing.decoupler) remember('components', existing.decoupler.ksaId || 'Decoupler');
  if (existing.dockingPort) remember('components', existing.dockingPort.ksaId || 'DockingPort');
  if (existing.evaDoor) remember('components', existing.evaDoor.ksaId || 'EVADoor');
  for (const n of existing.unknownComponents) remember('components', n.attrs.Key || n.tag);
  for (const l of target.lights)
    if (l.ownerTemplateId == null) remember('components', l.ksaId || l.id);
  for (const s of target.ivaSeats) remember('components', s.ksaId || 'IVASeat');
  for (const c of [
    ...existing.combustors,
    ...existing.thermalCores,
    ...existing.antimatterRamCores,
    ...existing.solidMotors,
  ])
    remember('cores', c.id);
  for (const n of [...existing.nozzles, ...existing.magneticNozzles, ...existing.solidNozzles])
    remember('nozzles', n.id);
  for (const r of existing.rockets) remember('rockets', r.id);
  for (const c of existing.rocketControllers) remember('controllers', c.id);
  for (const g of existing.gimbals) remember('gimbals', g.key || g.subPartInstanceId);

  for (const t of game.tanks) t.id = reserve('components', t.id || 'Tank');
  for (const b of game.batteries) b.ksaId = reserve('components', b.ksaId || 'Battery');
  for (const g of game.generators) g.ksaId = reserve('components', g.ksaId || 'Generator');
  for (const sp of game.solarPanels) sp.ksaId = reserve('components', sp.ksaId || 'SolarPanel');
  if (game.powerConsumer && !existing.powerConsumer)
    game.powerConsumer.ksaId = reserve('components', game.powerConsumer.ksaId || 'PowerConsumer');
  if (game.decoupler)
    game.decoupler.ksaId = reserve('components', game.decoupler.ksaId || 'Decoupler');
  if (game.controllable) game.controlKey = reserve('components', game.controlKey || 'Control');
  if (game.dockingPort)
    game.dockingPort.ksaId = reserve('components', game.dockingPort.ksaId || 'DockingPort');
  if (game.evaDoor) game.evaDoor.ksaId = reserve('components', game.evaDoor.ksaId || 'EVADoor');
  for (const m of game.solidGrainSegments)
    m.id = reserve('components', m.id || 'SolidGrainSegment');
  for (const m of game.magneticScoops) m.id = reserve('components', m.id || 'MagneticScoop');
  for (const n of game.unknownComponents ?? [])
    n.attrs.Key = reserve('components', n.attrs.Key || n.tag);
  for (const l of incomingLights)
    if (l.ownerTemplateId == null) l.ksaId = reserve('components', l.ksaId || l.id || 'Light');
  for (const s of incomingSeats) s.ksaId = reserve('components', s.ksaId || 'IVASeat');
  for (const c of [
    ...game.combustors,
    ...game.thermalCores,
    ...game.antimatterRamCores,
    ...game.solidMotors,
  ])
    c.id = reserve('cores', c.id);
  for (const n of [...game.nozzles, ...game.magneticNozzles, ...game.solidNozzles])
    n.id = reserve('nozzles', n.id);
  for (const r of game.rockets) r.id = reserve('rockets', r.id);
  for (const c of game.rocketControllers) c.id = reserve('controllers', c.id);
  for (const g of game.gimbals) g.key = reserve('gimbals', g.key || g.subPartInstanceId);

  const ref = (group: Group, key: string) => maps[group].get(norm(key)) ?? key;
  const remapRef = (r: SubPartIdRef, group: Group) => {
    if (!r.subPartInstanceId) r.id = ref(group, r.id);
  };
  for (const c of [
    ...game.combustors,
    ...game.thermalCores,
    ...game.antimatterRamCores,
    ...game.solidMotors,
  ])
    for (const f of c.feeds)
      if (f.kind === 'container' && !f.subPartInstanceId)
        f.containerId = ref('components', f.containerId);
  for (const r of game.rockets) {
    remapRef(r.core, 'cores');
    for (const n of r.nozzles) remapRef(n, 'nozzles');
  }
  for (const c of game.rocketControllers) for (const r of c.rocketRefs) remapRef(r, 'rockets');
  for (const w of game.consumerFeedWiring) {
    if (!w.subPartInstanceId) w.consumerId = ref('cores', w.consumerId);
    for (const f of w.feeds)
      if (f.kind === 'container' && !f.subPartInstanceId)
        f.containerId = ref('components', f.containerId);
  }
  if (game.evaDoor?.seatId) game.evaDoor.seatId = ref('components', game.evaDoor.seatId);
  const raw = (nodes: RawXmlNode[]) => {
    for (const n of nodes) {
      const groups: Record<string, Group> = {
        Container: 'components',
        Core: 'cores',
        Nozzle: 'nozzles',
        Rocket: 'rockets',
        ConsumerFeedWiring: 'cores',
      };
      if (n.tag === 'PrimarySequenceModule' && n.attrs.KeyRef && !n.attrs.SubPart) {
        const mapped = Object.values(maps).flatMap((m) =>
          m.has(norm(n.attrs.KeyRef)) ? [m.get(norm(n.attrs.KeyRef))!] : [],
        );
        if (mapped.length === 1) n.attrs.KeyRef = mapped[0];
      }
      const group = groups[n.tag];
      if (group && n.attrs.KeyRef && !n.attrs.SubPart) n.attrs.KeyRef = ref(group, n.attrs.KeyRef);
      if (n.attrs.SeatId) n.attrs.SeatId = ref('components', n.attrs.SeatId);
      raw(n.children ?? []);
    }
  };
  raw(game.unknownChildren);
  raw(game.unknownComponents ?? []);
  return { game, seats: incomingSeats, lights: incomingLights };
}

/** Merge retained array wrappers as arrays rather than duplicate row children. */
export function mergeImportedRawChildren(target: RawXmlNode[], incoming: RawXmlNode[]): void {
  const arrays = new Set(['AlignedGroups', 'SymmetryGroups', 'SubPartGroups', 'Grabs']);
  for (const node of incoming) {
    const existing = target.find((n) => n.tag === node.tag);
    if (existing && arrays.has(node.tag)) existing.children.push(...node.children);
    else if (!existing) target.push(node);
  }
}
