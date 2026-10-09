import { css } from 'lit';

export const pickerStyles = css`
  :host {
    display: inline-block;
    font:
      13px Arial,
      sans-serif;
    color: #34435a;
    --picker-accent: #2678db;
    --picker-range: #e4efff;
  }
  * {
    box-sizing: border-box;
  }
  .panel {
    background: white;
    border: 1px solid #dce2eb;
    border-radius: 5px;
    box-shadow: 0 6px 24px #1a2b4020;
    min-width: 292px;
    max-width: 100%;
  }
  .top {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 10px 12px 6px;
    white-space: nowrap;
  }
  .top span {
    margin-right: 3px;
  }
  .top button {
    border: 1px solid #d0d9e6;
    border-radius: 3px;
    padding: 5px 10px;
    background: white;
    color: #63758e;
    cursor: pointer;
  }
  .top button.active {
    border-color: #80aef1;
    color: #246bc4;
    background: #edf5ff;
  }
  .top .x {
    margin-left: auto;
    border: 0;
    font-size: 18px;
    padding: 0 3px;
  }
  .presets {
    padding: 8px 12px 14px;
    display: grid;
    gap: 12px;
  }
  .preset-row {
    display: flex;
    gap: 5px;
  }
  .preset-row button {
    border: 1px solid #bfcbd9;
    background: white;
    border-radius: 18px;
    padding: 5px 8px;
    color: #65778c;
    cursor: pointer;
    font-size: 12px;
    white-space: nowrap;
  }
  .preset-row button.selected {
    border-color: #79a8eb;
    background: #e9f2ff;
    color: #2678db;
  }
  .calendars {
    display: flex;
    gap: 12px;
    padding: 6px 10px 10px;
  }
  .summary {
    border-top: 1px solid #e6eaf0;
    padding: 9px 12px;
    color: #67788e;
    font-size: 12px;
  }
  .actions {
    display: flex;
    gap: 9px;
    border-top: 1px solid #e6eaf0;
    padding: 10px 12px;
  }
  .actions button {
    border: 0;
    background: none;
    color: #3578c7;
    cursor: pointer;
    padding: 5px 8px;
  }
  .actions .save {
    background: #2678db;
    color: white;
    border-radius: 3px;
  }
  .actions .save:disabled {
    opacity: 0.45;
    cursor: default;
  }
  @media (max-width: 580px) {
    .calendars {
      flex-direction: column;
    }
    .panel {
      width: min(100%, 320px);
    }
  }
`;
