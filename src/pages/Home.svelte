<script lang="ts">
  import { onMount } from 'svelte';
  import {
    Pencil,
    Plus,
    Check,
    Undo2,
    Redo2,
    RotateCw,
    Trash2,
    X,
    Thermometer,
    Droplets,
    Wind,
    Grip,
    Sofa,
  } from '@lucide/svelte';
  import FloorPlan from '../lib/LiftedFloorPlan.svelte';
  import FurnitureGlyph from '../lib/FurnitureGlyph.svelte';
  import TimeSeries from '../lib/TimeSeries.svelte';
  import {
    initialLayout,
    cloneLayout,
    furnitureTypes,
    layoutError,
    snap,
    type HomeLayout,
    type Room,
    type Furniture,
  } from '../lib/home-layout';
  import { api, errorMessage } from '../lib/api';
  let layout = $state<HomeLayout>(cloneLayout(initialLayout)),
    savedLayout = $state<HomeLayout>(cloneLayout(initialLayout));
  let editing = $state(false),
    selected = $state('living'),
    busy = $state(false),
    loading = $state(true),
    loaded = $state(false),
    savedAt = $state(''),
    error = $state(''),
    notice = $state(''),
    hasDraft = $state(false),
    confirmRoomDelete = $state(false);
  let undo = $state<HomeLayout[]>([]),
    redo = $state<HomeLayout[]>([]);
  const room = $derived(layout.rooms.find((r) => r.id === selected));
  const item = $derived(layout.furniture.find((f) => f.id === selected));
  const activeRoom = $derived(
    room ?? layout.rooms.find((r) => r.id === item?.roomId) ?? layout.rooms[0],
  );
  const invalid = $derived(layoutError(layout));
  const dirty = $derived(JSON.stringify(layout) !== JSON.stringify(savedLayout));
  const area = $derived(layout.rooms.reduce((n, r) => n + r.width * r.height, 0));
  const reading = $derived(
    activeRoom?.name === '卧室' ? 23.5 : activeRoom?.name === '书房' ? 24.8 : 24.1,
  );
  const temperature = $derived(
    Array.from(
      { length: 24 },
      (_, i) => reading + (Math.sin((i - 7) * 0.22) - Math.sin(16 * 0.22)) * 1.2,
    ),
  );
  function load() {
    loading = true;
    error = '';
    void api<{ layout: HomeLayout | null; saved_at: string | null }>('/home/layout')
      .then((result) => {
        if (result.layout) {
          layout = result.layout;
          savedLayout = cloneLayout(layout);
          selected = layout.rooms[0].id;
        }
        savedAt = result.saved_at ?? '';
        loaded = true;
      })
      .catch((e) => (error = errorMessage(e)))
      .finally(() => (loading = false));
  }
  onMount(() => {
    load();
    try {
      hasDraft = !!localStorage.getItem('insightra-home-draft');
    } catch {}
  });
  function snapshot() {
    undo = [...undo.slice(-49), cloneLayout(layout)];
    redo = [];
  }
  function change(next: HomeLayout) {
    layout = next;
    try {
      localStorage.setItem('insightra-home-draft', JSON.stringify(next));
    } catch {
      notice = '浏览器草稿存储不可用，请使用保存布局。';
    }
  }
  function updateRoom(field: keyof Room, value: string | number) {
    if (!room) return;
    snapshot();
    const next = cloneLayout(layout);
    Object.assign(
      next.rooms.find((r) => r.id === room.id)!,
      { [field]: value },
    );
    change(next);
  }
  function updateItem(field: keyof Furniture, value: number) {
    if (!item) return;
    snapshot();
    const next = cloneLayout(layout);
    Object.assign(
      next.furniture.find((f) => f.id === item.id)!,
      { [field]: value },
    );
    change(next);
  }
  function back() {
    const previous = undo.at(-1);
    if (!previous) return;
    redo = [...redo, cloneLayout(layout)];
    undo = undo.slice(0, -1);
    change(previous);
  }
  function forward() {
    const next = redo.at(-1);
    if (!next) return;
    undo = [...undo, cloneLayout(layout)];
    redo = redo.slice(0, -1);
    change(next);
  }
  function begin() {
    editing = true;
    notice = '';
    error = '';
  }
  function discard() {
    layout = cloneLayout(savedLayout);
    editing = false;
    undo = [];
    redo = [];
    selected = layout.rooms[0].id;
    hasDraft = false;
    try {
      localStorage.removeItem('insightra-home-draft');
    } catch {}
  }
  function restore() {
    try {
      const value = JSON.parse(localStorage.getItem('insightra-home-draft') || 'null');
      if (!value?.rooms?.length || !Array.isArray(value.furniture)) throw new Error();
      layout = value;
      editing = true;
      hasDraft = false;
      selected = layout.rooms[0].id;
    } catch {
      error = '草稿无法读取，请重新编辑。';
    }
  }
  async function save() {
    if (invalid) return;
    busy = true;
    error = '';
    try {
      const result = await api<{ layout: HomeLayout; saved_at: string }>('/home/layout', {
        method: 'PUT',
        body: JSON.stringify(layout),
      });
      savedLayout = cloneLayout(result.layout);
      savedAt = result.saved_at;
      editing = false;
      undo = [];
      redo = [];
      hasDraft = false;
      notice = '布局已保存到本机，重新打开后仍会保留。';
      try {
        localStorage.removeItem('insightra-home-draft');
      } catch {}
    } catch (e) {
      error = errorMessage(e);
    } finally {
      busy = false;
    }
  }
  function addRoom() {
    if (layout.rooms.length >= 30) {
      notice = '最多支持 30 个房间。';
      return;
    }
    const next = cloneLayout(layout);
    for (let y = 1; y <= 11; y += 0.5)
      for (let x = 1; x <= 17; x += 0.5) {
        const newRoom = { id: crypto.randomUUID(), name: '新房间', x, y, width: 3, height: 3 };
        const candidate = { ...next, rooms: [...next.rooms, newRoom] };
        if (!layoutError(candidate)) {
          snapshot();
          change(candidate);
          selected = newRoom.id;
          return;
        }
      }
    notice = '画布中没有足够的空位，请先调整房间。';
  }
  function addFurniture(kind: string) {
    if (!activeRoom) return;
    if (layout.furniture.length >= 200) {
      notice = '最多支持 200 件家具。';
      return;
    }
    const type = furnitureTypes.find((t) => t.kind === kind)!;
    if (type.width > activeRoom.width || type.height > activeRoom.height) {
      notice = '这件家具放不进当前房间，请选择更大的房间。';
      return;
    }
    const id = crypto.randomUUID();
    const ys = Array.from(
      { length: Math.floor((activeRoom.height - type.height) * 5) + 1 },
      (_, i) => snap(i * 0.2),
    ).sort((a, b) => Number(a < 0.9) - Number(b < 0.9) || a - b);
    for (const y of ys) {
      for (let x = 0; x <= activeRoom.width - type.width + 0.001; x += 0.2) {
        const object = {
          id,
          roomId: activeRoom.id,
          kind,
          width: type.width,
          height: type.height,
          x: snap(x),
          y: snap(y),
          rotation: 0,
        };
        const next = { ...cloneLayout(layout), furniture: [...layout.furniture, object] };
        if (!layoutError(next)) {
          snapshot();
          change(next);
          selected = id;
          notice = '已添加到空位，可拖动调整位置。';
          return;
        }
      }
    }
    notice = '没有足够的合法空位，请调整家具或扩大房间。';
  }
  function rotate() {
    if (!item) return;
    snapshot();
    const next = cloneLayout(layout);
    const target = next.furniture.find((f) => f.id === item.id)!;
    [target.width, target.height] = [target.height, target.width];
    target.rotation = (target.rotation + 90) % 360;
    change(next);
  }
  function remove() {
    snapshot();
    if (item) {
      change({
        ...cloneLayout(layout),
        furniture: layout.furniture.filter((f) => f.id !== item.id),
      });
      selected = activeRoom.id;
    } else if (room && layout.rooms.length > 1) {
      const id = room.id;
      change({
        rooms: layout.rooms.filter((r) => r.id !== id),
        furniture: layout.furniture.filter((f) => f.roomId !== id),
      });
      selected = layout.rooms[0].id;
    }
    confirmRoomDelete = false;
  }
</script>

<svelte:window
  onbeforeunload={(e) => {
    if (editing && dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  }}
/>
<main class="module-page home-page">
  <section class="page-heading">
    <div>
      <div class="eyebrow">YOUR LIVING SPACE</div>
      <h1>
        {editing ? '让布局，贴近你的家' : '感知空间里的每一刻'}<span class="heading-dot">。</span>
      </h1>
      <p>
        {editing
          ? '选择房间调整尺寸，拖动家具布置空间。'
          : '一个真实的布局，承载之后接入的每一份环境数据。'}
      </p>
    </div>
    <div class="home-header-actions">
      {#if editing}<button class="button" disabled={busy} onclick={discard}>取消编辑</button><button
          class="button primary inline-primary"
          disabled={busy || !!invalid}
          onclick={save}><Check size={15} />{busy ? '保存中…' : '保存布局'}</button
        >{:else}<button class="button" disabled={loading || !loaded} onclick={begin}
          ><Pencil size={15} />编辑家庭布局</button
        >{/if}
    </div>
  </section>
  {#if error}<div role="alert" class="message error">
      {error}{#if !loaded}<button class="text-button" onclick={load}>重试读取布局</button>{/if}
    </div>{/if}{#if notice}<div role="status" class="message success">
      {notice}
    </div>{/if}{#if hasDraft && !editing}<div class="draft-banner">
      有一份未保存的布局草稿。<button class="text-button" onclick={restore}>恢复草稿</button><button
        class="text-button"
        onclick={discard}>丢弃草稿</button
      >
    </div>{/if}
  <div class="home-layout-summary">
    <span><b>{layout.rooms.length}</b> 个房间</span><span><b>{area.toFixed(1)}</b> m²</span><span
      ><b>{layout.furniture.length}</b> 件家具</span
    ><span
      >{editing
        ? dirty
          ? '编辑中 · 尚未保存'
          : '编辑中'
        : savedAt
          ? '已保存的家庭布局'
          : '初始示例布局 · 可自由修改'}</span
    >
  </div>
  <div inert={busy} class="home-design-layout" class:home-is-editing={editing}>
    <section class="home-plan-surface">
      <div class="plan-toolbar">
        <div>
          <h2>{editing ? '布局编辑器' : '空间概览'}</h2>
          <span>{editing ? '0.1 m 对齐 · 房间可拖动，右下角可拉伸' : '按实际尺寸比例显示'}</span>
        </div>
        {#if editing}<div class="plan-tools">
            <button
              class="icon-button"
              aria-label="撤销布局修改"
              disabled={!undo.length}
              onclick={back}><Undo2 size={17} /></button
            ><button
              class="icon-button"
              aria-label="重做布局修改"
              disabled={!redo.length}
              onclick={forward}><Redo2 size={17} /></button
            ><button class="button" onclick={addRoom}><Plus size={14} />添加房间</button>
          </div>{/if}
      </div>
      <FloorPlan
        {layout}
        {editing}
        {selected}
        onselect={(id) => {
          selected = id;
          confirmRoomDelete = false;
        }}
        onbegin={snapshot}
        onchange={change}
      />
      {#if editing && invalid}<div class="layout-validation" role="alert">{invalid}</div>{/if}
      <div class="plan-footer">
        <span>{editing ? '方向键移动 0.1 m · Shift + 方向键移动 1 m' : '点击房间查看对应环境'}</span
        ><span>{editing ? '修改暂存于浏览器草稿，保存后写入本机数据库' : '传感器尚未接入'}</span>
      </div>
    </section>
    {#if editing}<aside class="layout-inspector">
        <div class="inspector-section">
          <span class="eyebrow">{item ? 'FURNITURE' : 'ROOM PROPERTIES'}</span>
          <h2>
            {item
              ? furnitureTypes.find((t) => t.kind === item.kind)?.name
              : (room?.name ?? '选择一个对象')}
          </h2>
          {#if room}<label class="editor-field"
              >房间名称<input
                aria-label="房间名称"
                value={room.name}
                maxlength="40"
                onchange={(e) => updateRoom('name', e.currentTarget.value)}
              /></label
            >
            <div class="dimension-fields">
              {#each [{ key: 'width', label: '房间宽度' }, { key: 'height', label: '房间长度' }, { key: 'x', label: '房间 X' }, { key: 'y', label: '房间 Y' }] as field}<label
                  class="editor-field"
                  >{field.label} <small>m</small><input
                    type="number"
                    aria-label={field.label}
                    step="0.1"
                    min={field.key === 'width' || field.key === 'height' ? 1 : 0}
                    max="20"
                    value={room[field.key as 'width' | 'height' | 'x' | 'y']}
                    onchange={(e) => {
                      if (e.currentTarget.value !== '')
                        updateRoom(field.key as keyof Room, Number(e.currentTarget.value));
                    }}
                  /></label
                >{/each}
            </div>
            <div class="inspector-footnote">
              面积 {(room.width * room.height).toFixed(1)} m² · 家具随房间一起移动
            </div>
            {#if layout.rooms.length > 1}{#if confirmRoomDelete}<p class="delete-layout-note">
                  同时删除房间里的家具？
                </p>
                <button class="button" onclick={remove}>确认删除房间</button><button
                  class="text-button"
                  onclick={() => (confirmRoomDelete = false)}>取消</button
                >{:else}<button
                  class="text-button delete-button"
                  onclick={() => (confirmRoomDelete = true)}><Trash2 size={13} />删除房间</button
                >{/if}{/if}
          {:else if item}<p class="inspector-footnote">所属房间：{activeRoom.name}</p>
            <div class="dimension-fields">
              {#each [{ key: 'width', label: '家具宽度' }, { key: 'height', label: '家具长度' }, { key: 'x', label: '家具 X' }, { key: 'y', label: '家具 Y' }] as field}<label
                  class="editor-field"
                  >{field.label}<small>m</small><input
                    type="number"
                    aria-label={field.label}
                    min={field.key === 'width' || field.key === 'height' ? 0.1 : 0}
                    step="0.1"
                    value={item[field.key as 'width' | 'height' | 'x' | 'y']}
                    onchange={(e) => {
                      if (e.currentTarget.value !== '')
                        updateItem(field.key as keyof Furniture, Number(e.currentTarget.value));
                    }}
                  /></label
                >{/each}
            </div>
            <div class="furniture-actions">
              <button class="button" onclick={rotate}><RotateCw size={14} />旋转 90°</button><button
                class="icon-button"
                aria-label="删除选中家具"
                onclick={remove}><Trash2 size={15} /></button
              >
            </div>{/if}
        </div>
        <div class="inspector-section">
          <div class="section-title">
            <h3>家具库</h3>
            <span>添加到{activeRoom?.name}</span>
          </div>
          <div class="furniture-library">
            {#each furnitureTypes as type}<button
                aria-label={`添加${type.name}`}
                onclick={() => addFurniture(type.kind)}
                ><svg viewBox="0 0 100 100" aria-hidden="true"
                  ><FurnitureGlyph kind={type.kind} /></svg
                ><span>{type.name}</span><small>{type.width} × {type.height} m</small></button
              >{/each}
          </div>
        </div>
      </aside>
    {:else}<aside class="home-reading-panel">
        <span class="eyebrow">ROOM OBSERVATION</span>
        <h2>{activeRoom?.name}</h2>
        <div class="room-size-label">
          {activeRoom?.width} × {activeRoom?.height} m <span>·</span>
          {((activeRoom?.width ?? 0) * (activeRoom?.height ?? 0)).toFixed(1)} m²
        </div>
        <div class="demo-banner"><span class="demo-pill">环境读数示例</span></div>
        <TimeSeries
          values={temperature}
          labels={Array.from({ length: 24 }, (_, i) => `${i}:00`)}
          title="温度"
          unit="°C"
          color="var(--chart-warm)"
        />
        <div class="room-readings">
          <div><Droplets size={16} /><span>湿度</span><strong>46%</strong></div>
          <div><Wind size={16} /><span>AQI</span><strong>28</strong></div>
        </div>
        <p class="page-note">布局可以真实编辑和保存。环境曲线仍为合成示例，等待接入设备。</p>
      </aside>{/if}
  </div>
</main>
