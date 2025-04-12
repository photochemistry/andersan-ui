<script>
  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();

  function handleClick() {
    dispatch('click');
  }
</script>

<button class="info-button" on:click={handleClick}>
  <span class="info-icon">i</span>
</button>

<style>
  .info-button {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    background-color: white;
    border: 2px solid #4a4a4a;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    transition: all 0.2s ease;
  }

  .info-button:hover {
    background-color: #f0f0f0;
    transform: scale(1.05);
  }

  .info-icon {
    font-family: Arial, sans-serif;
    font-weight: bold;
    font-size: 20px;
    color: #4a4a4a;
  }
</style> 