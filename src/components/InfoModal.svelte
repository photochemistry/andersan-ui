<script>
  export let isOpen = false;
  export let onClose;

  function handleClose() {
    onClose();
  }
</script>

{#if isOpen}
  <div class="modal-overlay" on:click={handleClose}>
    <div class="modal-content" on:click|stopPropagation>
      <div class="modal-header">
        <h2>Andersanについて</h2>
        <button class="close-button" on:click={handleClose}>×</button>
      </div>
      <div class="modal-body">
        <p>Andersanは、光化学オキシダント濃度を予想し、健康で安全な暮らしを守るためのWebアプリケーションです。</p>
        <p>主な機能：</p>
        <ul>
          <li>光化学オキシダントの予測値の表示</li>
          <li>光化学スモッグ注意報が発令される確率の予想</li>
          <li>全国どこでも利用可能</li>
        </ul>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  }

  .modal-content {
    background-color: white;
    border-radius: 8px;
    padding: 20px;
    width: 80%;
    max-width: 500px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }

  .modal-header h2 {
    margin: 0;
    font-size: 1.5em;
    color: #333;
  }

  .close-button {
    background: none;
    border: none;
    font-size: 24px;
    cursor: pointer;
    color: #666;
  }

  .modal-body {
    color: #444;
    line-height: 1.6;
  }

  .modal-body ul {
    padding-left: 20px;
  }

  .modal-body li {
    margin-bottom: 8px;
  }
</style> 