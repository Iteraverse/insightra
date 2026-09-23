<script lang="ts">
  import { tick } from 'svelte';
  import FurnitureGlyph from './FurnitureGlyph.svelte';
  import {
    cloneLayout,
    snap,
    layoutError,
    type HomeLayout,
    type Room,
    type Furniture,
  } from './home-layout';
  let {
    layout,
    editing = false,
    selected = '',
    onselect = () => {},
    onbegin = () => {},
    onchange = () => {},
    onfeedback = () => {},
  } = $props<{
    layout: HomeLayout;
    editing?: boolean;
    selected?: string;
    onselect?: (id: string) => void;
    onbegin?: () => void;
    onchange?: (value: HomeLayout) => void;
    onfeedback?: (text: string) => void;
  }>();
  type Drag = {
    id: string;
    type: 'room' | 'furniture' | 'resize';
    x: number;
    y: number;
    pointer: number;
    base: HomeLayout;
  };
  let svg: SVGSVGElement;
  let drag = $state<Drag | null>(null),
    preview = $state<HomeLayout | null>(null),
    status = $state('');
  const displayed: HomeLayout = $derived(preview ?? layout);
  const draggingRoom = $derived(
    drag && drag.type !== 'furniture' ? displayed.rooms.find((r) => r.id === drag!.id) : undefined,
  );
  const draggingItem = $derived(
    drag?.type === 'furniture' ? displayed.furniture.find((f) => f.id === drag!.id) : undefined,
  );
  const draggingOwner = $derived(
    draggingItem ? displayed.rooms.find((r) => r.id === draggingItem.roomId) : undefined,
  );
  const footprint = $derived(
    draggingRoom
      ? { x: draggingRoom.x, y: draggingRoom.y, w: draggingRoom.width, h: draggingRoom.height }
      : draggingItem && draggingOwner
        ? {
            x: draggingOwner.x + draggingItem.x,
            y: draggingOwner.y + draggingItem.y,
            w: draggingItem.width,
            h: draggingItem.height,
          }
        : null,
  );
  const original = $derived.by(() => {
    if (!drag) return null;
    if (drag.type === 'furniture') {
      const f = drag.base.furniture.find((f) => f.id === drag!.id)!,
        r = drag.base.rooms.find((r) => r.id === f.roomId)!;
      return { x: r.x + f.x, y: r.y + f.y, w: f.width, h: f.height };
    }
    const r = drag.base.rooms.find((r) => r.id === drag!.id)!;
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  const invalid = $derived(preview ? layoutError(preview) : '');
  const selectedRoom = $derived(displayed.rooms.find((r) => r.id === selected));
  const extents = $derived(
    editing
      ? { w: 20, h: 14 }
      : {
          w: Math.max(12, ...layout.rooms.map((r: Room) => r.x + r.width + 1)),
          h: Math.max(9, ...layout.rooms.map((r: Room) => r.y + r.height + 1)),
        },
  );
  function point(e: PointerEvent) {
    const p = svg.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    return p.matrixTransform(svg.getScreenCTM()!.inverse());
  }
  function start(e: PointerEvent, id: string, type: Drag['type']) {
    if (e.button !== 0 || drag) return;
    onselect(id);
    if (!editing) return;
    e.preventDefault();
    e.stopPropagation();
    const p = point(e);
    drag = { id, type, x: p.x / 50, y: p.y / 50, pointer: e.pointerId, base: cloneLayout(layout) };
    preview = cloneLayout(layout);
    status = '';
    svg.setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent) {
    if (!drag || drag.pointer !== e.pointerId) return;
    const p = point(e),
      dx = p.x / 50 - drag.x,
      dy = p.y / 50 - drag.y;
    const next = cloneLayout(drag.base);
    if (drag.type === 'furniture') {
      const f = next.furniture.find((f) => f.id === drag!.id)!;
      f.x = snap(f.x + dx);
      f.y = snap(f.y + dy);
    } else {
      const r = next.rooms.find((r) => r.id === drag!.id)!;
      if (drag.type === 'resize') {
        r.width = snap(Math.max(1, r.width + dx));
        r.height = snap(Math.max(1, r.height + dy));
      } else {
        r.x = snap(r.x + dx);
        r.y = snap(r.y + dy);
      }
    }
    preview = next;
  }
  function finish(cancel = false) {
    if (!drag) return;
    const old = drag;
    const next = preview;
    const problem = invalid;
    drag = null;
    preview = null;
    if (svg.hasPointerCapture(old.pointer)) svg.releasePointerCapture(old.pointer);
    void tick().then(() =>
      svg
        .querySelector<SVGElement>(`[data-plan-id="${CSS.escape(old.id)}"]`)
        ?.focus({ preventScroll: true }),
    );
    if (cancel) {
      status = '已取消拖动，位置未改变。';
      return;
    }
    if (problem) {
      status = '不能放置：' + problem + ' 已返回原位。';
      onfeedback(status);
      return;
    }
    if (next && JSON.stringify(next) !== JSON.stringify(old.base)) {
      onbegin();
      onchange(next);
      status = '已放置，可撤销。';
    } else status = '';
  }
  function keyboard(e: KeyboardEvent, id: string, type: 'room' | 'furniture') {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onselect(id);
      return;
    }
    if (!editing || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    const next = cloneLayout(layout),
      object =
        type === 'room'
          ? next.rooms.find((r) => r.id === id)!
          : next.furniture.find((f) => f.id === id)!,
      step = e.shiftKey ? 1 : 0.1;
    object.x = snap(object.x + (e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0));
    object.y = snap(object.y + (e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0));
    const problem = layoutError(next);
    if (problem) {
      status = problem;
      onfeedback(problem);
      return;
    }
    onbegin();
    onchange(next);
  }
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.key === 'Escape' && drag) {
      e.preventDefault();
      finish(true);
    }
  }}
/>
{#snippet roomShape(room: Room)}<rect
    x={room.x * 50}
    y={room.y * 50}
    width={room.width * 50}
    height={room.height * 50}
    rx="2"
    class="room-outline"
  /><text x={room.x * 50 + 13} y={room.y * 50 + 23} class="plan-room-name">{room.name}</text><text
    x={room.x * 50 + 13}
    y={room.y * 50 + 40}
    class="plan-room-area">{(room.width * room.height).toFixed(1)} m²</text
  >{/snippet}
{#snippet furnitureShape(item: Furniture, owner: Room)}<svg
    x={(owner.x + item.x) * 50}
    y={(owner.y + item.y) * 50}
    width={item.width * 50}
    height={item.height * 50}
    viewBox="0 0 100 100"
    preserveAspectRatio="none"
    ><g transform={`rotate(${item.rotation} 50 50)`}><FurnitureGlyph kind={item.kind} /></g></svg
  >{/snippet}
<div
  class="plan-scroll lifted-plan-scroll"
  class:plan-editing={editing}
  class:drag-in-progress={drag !== null}
>
  <svg
    bind:this={svg}
    class="editable-plan"
    viewBox={`0 0 ${extents.w * 50} ${extents.h * 50}`}
    role="img"
    aria-label={editing ? '家庭布局编辑画布，房间和家具可拖动或用方向键移动' : '家庭平面布局'}
    onpointermove={move}
    onpointerup={() => finish()}
    onpointercancel={() => finish(true)}
    onlostpointercapture={() => {
      if (drag) finish(true);
    }}
  >
    <defs
      ><pattern id="home-grid-lift" width="25" height="25" patternUnits="userSpaceOnUse"
        ><path d="M25 0H0V25" fill="none" stroke="var(--border)" stroke-width=".5" /></pattern
      ></defs
    >{#if editing}<rect width="1000" height="700" fill="url(#home-grid-lift)" />{/if}
    <g class="stationary-layout"
      >{#each layout.rooms.filter((r: Room) => r.id !== draggingRoom?.id) as room}<g
          class="plan-room"
          data-plan-id={room.id}
          class:plan-selected={selected === room.id}
          role="button"
          tabindex="0"
          aria-label={`选择房间 ${room.name}`}
          aria-pressed={selected === room.id}
          onpointerdown={(e) => start(e, room.id, 'room')}
          onkeydown={(e) => keyboard(e, room.id, 'room')}>{@render roomShape(room)}</g
        >{/each}
      {#each [...layout.furniture]
        .filter((f) => f.id !== draggingItem?.id && f.roomId !== draggingRoom?.id)
        .sort((a, b) => Number(b.kind === 'rug') - Number(a.kind === 'rug')) as item}{@const owner =
          layout.rooms.find((r: Room) => r.id === item.roomId)!}<g
          class="plan-furniture"
          data-plan-id={item.id}
          class:furniture-selected={selected === item.id}
          role="button"
          tabindex={editing ? 0 : -1}
          aria-label={`选择家具 ${item.kind} ${item.id}`}
          onpointerdown={(e) => {
            if (editing) start(e, item.id, 'furniture');
            else onselect(owner.id);
          }}
          onkeydown={(e) => keyboard(e, item.id, 'furniture')}
          >{@render furnitureShape(item, owner)}{#if editing && selected === item.id}<rect
              x={(owner.x + item.x) * 50 - 2}
              y={(owner.y + item.y) * 50 - 2}
              width={item.width * 50 + 4}
              height={item.height * 50 + 4}
              fill="none"
              stroke="var(--accent)"
              stroke-width="1"
              stroke-dasharray="3 3"
            />{/if}</g
        >{/each}</g
    >
    {#if drag && original}<rect
        class="drag-origin-outline"
        x={original.x * 50}
        y={original.y * 50}
        width={original.w * 50}
        height={original.h * 50}
        rx="2"
        pointer-events="none"
      />{/if}
    {#if drag && footprint}<g
        class="drag-placement-preview"
        class:placement-invalid={!!invalid}
        data-valid={String(!invalid)}
        pointer-events="none"
        ><rect
          x={footprint.x * 50}
          y={footprint.y * 50}
          width={footprint.w * 50}
          height={footprint.h * 50}
          rx="2"
        /></g
      >{/if}
    {#if selectedRoom && !drag}<g
        class="room-selection-overlay"
        pointer-events="none"
        aria-hidden="true"
        ><rect
          x={selectedRoom.x * 50}
          y={selectedRoom.y * 50}
          width={selectedRoom.width * 50}
          height={selectedRoom.height * 50}
          rx="2"
          fill="none"
          stroke="var(--chart-warm)"
          stroke-width="3"
        />{#if editing}<text
            x={(selectedRoom.x + selectedRoom.width / 2) * 50}
            y={selectedRoom.y * 50 - 8}
            text-anchor="middle"
            class="dimension-text">{selectedRoom.width.toFixed(1)} m</text
          ><text
            x={(selectedRoom.x + selectedRoom.width) * 50 + 9}
            y={(selectedRoom.y + selectedRoom.height / 2) * 50}
            class="dimension-text">{selectedRoom.height.toFixed(1)} m</text
          >{/if}</g
      >{/if}
    <path
      d={`M25 ${extents.h * 50 - 20}h50m-50 -4v8m50 -8v8`}
      fill="none"
      stroke="var(--muted)"
    /><text x="85" y={extents.h * 50 - 16} class="plan-room-area">1 m</text>
    {#if drag && footprint}<g
        class="drag-floating-layer"
        class:drop-invalid={!!invalid}
        pointer-events="none"
        aria-hidden="true"
        ><g class="drag-lift-content"
          >{#if draggingRoom}<g class="floating-room">{@render roomShape(draggingRoom)}</g
            >{#each [...displayed.furniture]
              .filter((f) => f.roomId === draggingRoom!.id)
              .sort((a, b) => Number(b.kind === 'rug') - Number(a.kind === 'rug')) as item}{@render furnitureShape(
                item,
                draggingRoom,
              )}{/each}{:else if draggingItem && draggingOwner}{@render furnitureShape(
              draggingItem,
              draggingOwner,
            )}{/if}<rect
            class="floating-edge"
            x={footprint.x * 50}
            y={footprint.y * 50}
            width={footprint.w * 50}
            height={footprint.h * 50}
            rx="2"
          /></g
        ></g
      >{/if}
    {#if editing && selectedRoom && !drag}<rect
        role="presentation"
        data-resize={selectedRoom.id}
        x={(selectedRoom.x + selectedRoom.width) * 50 - 6}
        y={(selectedRoom.y + selectedRoom.height) * 50 - 6}
        width="12"
        height="12"
        rx="2"
        class="resize-handle"
        onpointerdown={(e) => start(e, selectedRoom.id, 'resize')}
      />{/if}
  </svg>
  {#if drag}<div class="placement-feedback" class:feedback-invalid={!!invalid} role="status">
      <i></i>{invalid ? '不能放置 · ' + invalid : '可以放置 · 松手确认'}<span>Esc 取消</span>
    </div>{:else if status}<div class="placement-status" role="status">{status}</div>{/if}
</div>
