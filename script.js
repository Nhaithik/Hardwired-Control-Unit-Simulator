// Instruction Definitions
const INSTRUCTIONS = {
  ADD:   { opcode: '0001', raw: '0001 0000 0010 1010', line: 'q_ADD', name: 'ADD' },
  SUB:   { opcode: '0010', raw: '0010 0000 0010 1011', line: 'q_SUB', name: 'SUB' },
  LOAD:  { opcode: '0011', raw: '0011 0000 0011 0000', line: 'q_LOAD', name: 'LOAD' },
  STORE: { opcode: '0100', raw: '0100 0000 0011 0001', line: 'q_STORE', name: 'STORE' },
  JMP:   { opcode: '0101', raw: '0101 0000 0101 0000', line: 'q_JMP', name: 'JMP' }
};

let step = 0;
let autoInterval = null;

const instSelect = document.getElementById('instSelect');
const rawIrDisplay = document.getElementById('rawIrDisplay');
const scDisplay = document.getElementById('scDisplay');
const logTerminal = document.getElementById('logTerminal');
const stepBtn = document.getElementById('stepBtn');
const runBtn = document.getElementById('runBtn');
const resetBtn = document.getElementById('resetBtn');

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

  const binSC = step.toString(2).padStart(3, '0');
  scDisplay.textContent = `${binSC} (${step})`;

  for (let i = 0; i <= 5; i++) {
    document.getElementById(`t${i}`).classList.toggle('active', i === step);
  }

  Object.keys(INSTRUCTIONS).forEach(instKey => {
    const item = INSTRUCTIONS[instKey];
    const el = document.getElementById(item.line);
    const isActive = (instKey === instSelect.value) && (step >= 2);
    el.classList.toggle('active', isActive);
    el.querySelector('.state-val').textContent = isActive ? '1 (HIGH)' : '0';
  });

  // Clear previous signals and visuals
  ALL_SIGNALS.forEach(sig => document.getElementById(sig).classList.remove('active'));
  ALL_EQUATIONS.forEach(eq => document.getElementById(eq).classList.remove('active'));
  document.querySelectorAll('.wire').forEach(w => w.classList.remove('active'));
  document.querySelectorAll('.hw-box').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.circuit-wire').forEach(w => w.classList.remove('active'));
  document.querySelectorAll('.gate-symbol').forEach(g => g.classList.remove('active'));
  document.querySelectorAll('.circuit-dot').forEach(d => d.classList.remove('active'));
  document.querySelectorAll('.out-pin-box').forEach(p => p.classList.remove('active'));

  let activeSignals = [];
  let activeEqs = [];
  let activeWires = [];
  let activeBlocks = [];
  let activeCircuitWires = [];
  let activeGates = [];
  let activePins = [];
  let microOp = "";
  let detail = "";

  if (step === 0) {
    activeSignals = ['sig_PC_out', 'sig_MAR_in'];
    activeEqs = ['eq_fetch1'];
    activeWires = ['wire_PC_bus', 'wire_bus_MAR'];
    activeBlocks = ['block_PC', 'block_MAR'];
    activeCircuitWires.push('rail_T0');
    activePins.push('pin_box_MAR');
    microOp = "MAR ← PC";
    detail = "Transfer address from PC to MAR for instruction fetch.";
  } else if (step === 1) {
    activeSignals = ['sig_MEM_read', 'sig_MDR_out', 'sig_IR_in', 'sig_PC_inc'];
    activeEqs = ['eq_fetch2'];
    activeWires = ['wire_MAR_MEM', 'wire_MEM_MDR', 'wire_MDR_bus', 'wire_bus_IR'];
    activeBlocks = ['block_MEM', 'block_MDR', 'block_IR', 'block_PC'];
    activeCircuitWires.push('rail_T1');
    activePins.push('pin_box_T1');
    microOp = "IR ← M[MAR], PC ← PC + 1";
    detail = "Fetch machine code into IR; increment Program Counter.";
  } else if (step === 2) {
    activeEqs = ['eq_decode'];
    activeWires = ['wire_IR_CU'];
    activeBlocks = ['block_IR', 'block_CU'];
    microOp = `Opcode Decoded: ${currentInst.name}`;
    detail = `Opcode bits (${currentInst.opcode}) decoded; line ${currentInst.line.replace('q_', 'q')} driven HIGH.`;
  } else if (step === 3) {
    if (currentInst.name === 'JMP') {
      activeSignals = ['sig_PC_load', 'sig_SC_clear'];
      activeEqs = ['eq_jmp', 'eq_sc_clr'];
      activeWires = ['wire_IR_CU'];
      activeBlocks = ['block_CU', 'block_PC'];
      activeCircuitWires.push('rail_T3', 'rail_q5', 'tap_q5_jmp', 'tap_t3_jmp', 'wire_gate_PC_load');
      activeGates.push('gate_AND_JMP');
      activePins.push('pin_box_PC_load');
      microOp = "PC ← IR[11:0], SC ← 0";
      detail = "Load target address into PC unconditionally; Reset Counter.";
    } else {
      activeSignals = ['sig_MAR_in'];
      activeEqs = ['eq_mem'];
      activeWires = ['wire_bus_MAR'];
      activeBlocks = ['block_MAR'];
      activeCircuitWires.push('rail_T3');
      microOp = "MAR ← IR[11:0]";
      detail = "Transfer operand address from IR address field to MAR.";
    }
  } else if (step === 4) {
    activeSignals.push('sig_SC_clear');
    activeEqs.push('eq_sc_clr');
    activeCircuitWires.push('rail_T4');

    if (currentInst.name === 'ADD') {
      activeSignals.push('sig_MEM_read', 'sig_ALU_add', 'sig_AC_load');
      activeEqs.push('eq_alu_add');
      activeWires = ['wire_MAR_MEM', 'wire_MEM_MDR', 'wire_MDR_bus', 'wire_bus_ALU', 'wire_ALU_AC'];
      activeBlocks = ['block_MEM', 'block_MDR', 'block_ALU', 'block_AC'];
      activeCircuitWires.push('rail_q1', 'tap_T4_add', 'wire_gate_ALU_add', 'tap_add_to_or', 'wire_gate_AC_load');
      activeGates.push('gate_AND_ADD', 'gate_OR_AC');
      activePins.push('pin_box_ALU_add', 'pin_box_AC_load');
      microOp = "AC ← AC + M[MAR], SC ← 0";
      detail = "Read data from memory, add via ALU, store in AC; reset SC.";
    } else if (currentInst.name === 'SUB') {
      activeSignals.push('sig_MEM_read', 'sig_ALU_sub', 'sig_AC_load');
      activeEqs.push('eq_alu_sub');
      activeWires = ['wire_MAR_MEM', 'wire_MEM_MDR', 'wire_MDR_bus', 'wire_bus_ALU', 'wire_ALU_AC'];
      activeBlocks = ['block_MEM', 'block_MDR', 'block_ALU', 'block_AC'];
      activeCircuitWires.push('rail_q2', 'tap_T4_sub', 'wire_gate_ALU_sub', 'tap_sub_to_or', 'wire_gate_AC_load');
      activeGates.push('gate_AND_SUB', 'gate_OR_AC');
      activePins.push('pin_box_ALU_sub', 'pin_box_AC_load');
      microOp = "AC ← AC - M[MAR], SC ← 0";
      detail = "Read data from memory, subtract via ALU, store in AC; reset SC.";
    } else if (currentInst.name === 'LOAD') {
      activeSignals.push('sig_MEM_read', 'sig_MDR_out', 'sig_AC_load');
      activeEqs.push('eq_load');
      activeWires = ['wire_MAR_MEM', 'wire_MEM_MDR', 'wire_MDR_bus', 'wire_ALU_AC'];
      activeBlocks = ['block_MEM', 'block_MDR', 'block_AC'];
      microOp = "AC ← M[MAR], SC ← 0";
      detail = "Read memory word directly into Accumulator; reset SC.";
    } else if (currentInst.name === 'STORE') {
      activeSignals.push('sig_MEM_write');
      activeEqs.push('eq_store');
      activeWires = ['wire_AC_bus', 'wire_MAR_MEM'];
      activeBlocks = ['block_AC', 'block_MEM'];
      microOp = "M[MAR] ← AC, SC ← 0";
      detail = "Write AC contents into memory cell; reset SC.";
    }
  }

  // Trigger UI Classes
  activeSignals.forEach(sig => {
    const el = document.getElementById(sig);
    if (el) el.classList.add('active');
  });
  activeEqs.forEach(eq => {
    const el = document.getElementById(eq);
    if (el) el.classList.add('active');
  });
  activeWires.forEach(w => {
    const el = document.getElementById(w);
    if (el) el.classList.add('active');
  });
  activeBlocks.forEach(b => {
    const box = document.querySelector(`#${b} .hw-box`);
    if (box) box.classList.add('active');
  });
  activeCircuitWires.forEach(w => {
    const el = document.getElementById(w);
    if (el) el.classList.add('active');
  });
  activeGates.forEach(gId => {
    const sym = document.querySelector(`#${gId} .gate-symbol`);
    if (sym) sym.classList.add('active');
  });
  activePins.forEach(pId => {
    const pin = document.getElementById(pId);
    if (pin) pin.classList.add('active');
  });

  if (microOp !== "") {
    logMessage(`T${step}`, microOp, detail);
  }
}

function clockPulse() {
  const currentInst = INSTRUCTIONS[instSelect.value];
  if ((currentInst.name === 'JMP' && step >= 3) || step >= 4) {
    step = 0;
  } else {
    step++;
  }
  updateSimulation();
}

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

updateSimulation();
