// Instruction Definitions
const INSTRUCTIONS = {
  ADD:   { opcode: '0001', raw: '0001 0000 0010 1010', line: 'q_ADD', name: 'ADD' },
  SUB:   { opcode: '0010', raw: '0010 0000 0010 1011', line: 'q_SUB', name: 'SUB' },
  LOAD:  { opcode: '0011', raw: '0011 0000 0011 0000', line: 'q_LOAD', name: 'LOAD' },
  STORE: { opcode: '0100', raw: '0100 0000 0011 0001', line: 'q_STORE', name: 'STORE' },
  JMP:   { opcode: '0101', raw: '0101 0000 0101 0000', line: 'q_JMP', name: 'JMP' }
};

let step = 0; // Sequence Counter step (0 to 5)
let autoInterval = null;

// DOM Elements
const instSelect = document.getElementById('instSelect');
const rawIrDisplay = document.getElementById('rawIrDisplay');
const scDisplay = document.getElementById('scDisplay');
const logTerminal = document.getElementById('logTerminal');
const stepBtn = document.getElementById('stepBtn');
const runBtn = document.getElementById('runBtn');
const resetBtn = document.getElementById('resetBtn');

// All Control Signal IDs
const ALL_SIGNALS = [
  'sig_PC_out', 'sig_PC_inc', 'sig_PC_load', 'sig_MAR_in',
  'sig_MEM_read', 'sig_MEM_write', 'sig_MDR_out', 'sig_IR_in',
  'sig_ALU_add', 'sig_ALU_sub', 'sig_AC_load', 'sig_SC_clear'
];

const ALL_EQUATIONS = [
  'eq_fetch1', 'eq_fetch2', 'eq_decode', 'eq_mem',
  'eq_alu_add', 'eq_alu_sub', 'eq_load', 'eq_store',
  'eq_jmp', 'eq_sc_clr'
];

function logMessage(timing, microOp, detail) {
  const line = document.createElement('div');
  line.className = 'log-line';
  line.innerHTML = `<span class="log-time">[${timing}]</span> <span class="log-op">${microOp}</span> <span class="log-desc">&mdash; ${detail}</span>`;
  logTerminal.appendChild(line);
  logTerminal.scrollTop = logTerminal.scrollHeight;
}

function updateSimulation() {
  const currentInst = INSTRUCTIONS[instSelect.value];
  rawIrDisplay.textContent = currentInst.raw;

  // Update Sequence Counter string display
  const binSC = step.toString(2).padStart(3, '0');
  scDisplay.textContent = `${binSC} (${step})`;

  // Update Timing Indicators (T0-T5)
  for (let i = 0; i <= 5; i++) {
    document.getElementById(`t${i}`).classList.toggle('active', i === step);
  }

  // Update Opcode Decoder lines
  Object.keys(INSTRUCTIONS).forEach(instKey => {
    const item = INSTRUCTIONS[instKey];
    const el = document.getElementById(item.line);
    const isActive = (instKey === instSelect.value) && (step >= 2); // Opcode decoded at T2
    el.classList.toggle('active', isActive);
    el.querySelector('.state-val').textContent = isActive ? '1 (HIGH)' : '0';
  });

  // Clear all active signal indicators & equations
  ALL_SIGNALS.forEach(sig => document.getElementById(sig).classList.remove('active'));
  ALL_EQUATIONS.forEach(eq => document.getElementById(eq).classList.remove('active'));

  // Active Control Equations & Signals logic (Boolean combinational block)
  let activeSignals = [];
  let activeEqs = [];
  let microOp = "";
  let detail = "";

  if (step === 0) {
    // T0: MAR <- PC
    activeSignals = ['sig_PC_out', 'sig_MAR_in'];
    activeEqs = ['eq_fetch1'];
    microOp = "MAR ← PC";
    detail = "Move contents of Program Counter to Memory Address Register for instruction fetch.";
  } else if (step === 1) {
    // T1: IR <- M[MAR], PC <- PC + 1
    activeSignals = ['sig_MEM_read', 'sig_MDR_out', 'sig_IR_in', 'sig_PC_inc'];
    activeEqs = ['eq_fetch2'];
    microOp = "IR ← M[MAR], PC ← PC + 1";
    detail = "Fetch machine code into IR; increment Program Counter to point to next instruction.";
  } else if (step === 2) {
    // T2: Decode Opcode
    activeEqs = ['eq_decode'];
    microOp = `Opcode Decoded: ${currentInst.name}`;
    detail = `Opcode bits (${currentInst.opcode}) decoded; line ${currentInst.line.replace('q_', 'q')} driven HIGH.`;
  } else if (step === 3) {
    // T3: Address fetch or Branch execution
    if (currentInst.name === 'JMP') {
      activeSignals = ['sig_PC_load', 'sig_SC_clear'];
      activeEqs = ['eq_jmp', 'eq_sc_clr'];
      microOp = "PC ← IR[11:0], SC ← 0";
      detail = "Load target address into PC unconditionally; Reset Sequence Counter.";
    } else {
      activeSignals = ['sig_MAR_in'];
      activeEqs = ['eq_mem'];
      microOp = "MAR ← IR[11:0]";
      detail = "Transfer operand address from IR address field to MAR.";
    }
  } else if (step === 4) {
    // T4: Execute Phase for Memory/ALU operations
    activeSignals.push('sig_SC_clear');
    activeEqs.push('eq_sc_clr');

    if (currentInst.name === 'ADD') {
      activeSignals.push('sig_MEM_read', 'sig_ALU_add', 'sig_AC_load');
      activeEqs.push('eq_alu_add');
      microOp = "AC ← AC + M[MAR], SC ← 0";
      detail = "Read data operand from memory, compute addition via ALU, store sum into AC; reset SC.";
    } else if (currentInst.name === 'SUB') {
      activeSignals.push('sig_MEM_read', 'sig_ALU_sub', 'sig_AC_load');
      activeEqs.push('eq_alu_sub');
      microOp = "AC ← AC - M[MAR], SC ← 0";
      detail = "Read data operand from memory, execute subtraction via ALU, store difference into AC; reset SC.";
    } else if (currentInst.name === 'LOAD') {
      activeSignals.push('sig_MEM_read', 'sig_MDR_out', 'sig_AC_load');
      activeEqs.push('eq_load');
      microOp = "AC ← M[MAR], SC ← 0";
      detail = "Read memory word directly into Accumulator; reset SC.";
    } else if (currentInst.name === 'STORE') {
      activeSignals.push('sig_MEM_write');
      activeEqs.push('eq_store');
      microOp = "M[MAR] ← AC, SC ← 0";
      detail = "Assert MEM_write signal to transfer contents of AC into selected memory cell; reset SC.";
    }
  }

  // Apply UI highlights for active control lines
  activeSignals.forEach(sig => {
    const el = document.getElementById(sig);
    if (el) el.classList.add('active');
  });
  activeEqs.forEach(eq => {
    const el = document.getElementById(eq);
    if (el) el.classList.add('active');
  });

  if (microOp !== "") {
    logMessage(`T${step}`, microOp, detail);
  }
}

// Step clock pulse
function clockPulse() {
  const currentInst = INSTRUCTIONS[instSelect.value];
  
  if ((currentInst.name === 'JMP' && step >= 3) || step >= 4) {
    step = 0;
  } else {
    step++;
  }
  updateSimulation();
}

// Event Listeners
stepBtn.addEventListener('click', clockPulse);

instSelect.addEventListener('change', () => {
  step = 0;
  logTerminal.innerHTML = '';
  logMessage('Reset', 'Instruction changed', `Loaded ${instSelect.value}. Counter reset to T0.`);
  updateSimulation();
});

resetBtn.addEventListener('click', () => {
  if (autoInterval) {
    clearInterval(autoInterval);
    autoInterval = null;
    runBtn.textContent = 'Auto Step';
  }
  step = 0;
  logMessage('Reset', 'Manual Reset Triggered', 'Sequence Counter set back to 0 (T0).');
  updateSimulation();
});

runBtn.addEventListener('click', () => {
  if (autoInterval) {
    clearInterval(autoInterval);
    autoInterval = null;
    runBtn.textContent = 'Auto Step';
  } else {
    runBtn.textContent = 'Pause';
    autoInterval = setInterval(clockPulse, 1200);
  }
});

// Initialize simulation
updateSimulation();
