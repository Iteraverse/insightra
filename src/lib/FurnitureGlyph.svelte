<script lang="ts">
  let { kind } = $props<{ kind: string }>();
</script>

<g class="furniture-drawing">
  {#if kind === 'plant'}<circle cx="50" cy="50" r="31" class="plant-leaf" /><ellipse
      cx="37"
      cy="40"
      rx="20"
      ry="13"
      class="plant-leaf"
    /><ellipse cx="63" cy="60" rx="20" ry="13" class="plant-leaf" /><circle
      cx="50"
      cy="50"
      r="10"
    />
  {:else if kind === 'rug'}<rect x="3" y="3" width="94" height="94" rx="4" class="rug-fill" /><rect
      x="10"
      y="10"
      width="80"
      height="80"
      rx="2"
      fill="none"
      stroke-dasharray="3 4"
    />
  {:else if kind === 'bed'}<rect x="3" y="3" width="94" height="94" rx="5" /><rect
      x="10"
      y="10"
      width="34"
      height="20"
      rx="4"
    /><rect x="56" y="10" width="34" height="20" rx="4" /><path d="M4 36H96M9 42H91M9 90H91" />
  {:else if kind === 'sofa'}<rect x="3" y="3" width="94" height="94" rx="9" /><path
      d="M13 34H87M33 35V83M66 35V83"
    /><rect x="3" y="25" width="10" height="65" rx="3" /><rect
      x="87"
      y="25"
      width="10"
      height="65"
      rx="3"
    />
  {:else if kind === 'table'}<rect x="5" y="5" width="90" height="90" rx="15" /><path
      d="M12 16H88M12 84H88"
    />
  {:else if kind === 'chair'}<rect x="5" y="5" width="90" height="90" rx="22" /><path
      d="M14 33H86M16 35V75M84 35V75"
    />
  {:else if kind === 'wardrobe'}<rect x="3" y="3" width="94" height="94" rx="2" /><path
      d="M50 4V96M44 41V59M56 41V59"
    />
  {:else}<rect x="3" y="3" width="94" height="94" rx="3" /><rect
      x="39"
      y="16"
      width="33"
      height="42"
      rx="2"
    /><path d="M4 76H96M12 79V96M88 79V96" />{/if}
</g>
