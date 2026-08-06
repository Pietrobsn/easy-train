export const student = {
  id: 'student',
  name: 'Aluno',
  currentStreak: 0,
  bestStreak: 0,
  lastWorkout: 'Nenhum treino registrado',
};

export const workoutPlan = {
  id: 'meu-plano',
  name: 'Meu plano de treino',
  startsAt: '',
  expiresAt: '',
  weeklyGoal: 3,
  days: [],
};


const exerciseDetails = {
  'supino-reto': { muscles: ['Peito', 'Tríceps'], tip: 'Mantenha as escápulas encaixadas no banco, os pés firmes e desça a barra com controle.' },
  'supino-inclinado': { muscles: ['Peito superior', 'Ombro'], tip: 'Evite deixar o banco inclinado demais. Controle os halteres e não bata um no outro no topo.' },
  crucifixo: { muscles: ['Peito'], tip: 'Mantenha os cotovelos levemente flexionados e pense em abraçar, sem forçar demais a amplitude.' },
  'remada-baixa': { muscles: ['Costas', 'Bíceps'], tip: 'Puxe com os cotovelos, mantenha o peito aberto e evite jogar o tronco para trás.' },
  'elevacao-lateral': { muscles: ['Ombros'], tip: 'Use carga controlada, suba até a linha dos ombros e evite embalar o corpo.' },
  'triceps-polia': { muscles: ['Tríceps'], tip: 'Fixe os cotovelos ao lado do corpo e estenda completamente sem movimentar os ombros.' },
  'triceps-frances': { muscles: ['Tríceps'], tip: 'Mantenha os cotovelos apontados para frente e desça a carga de forma confortável atrás da cabeça.' },
  agachamento: { muscles: ['Quadríceps', 'Glúteos'], tip: 'Mantenha os pés firmes, joelhos acompanhando a direção dos pés e desça apenas com controle.' },
  'leg-press': { muscles: ['Quadríceps', 'Glúteos'], tip: 'Não retire o quadril do banco e evite travar completamente os joelhos no final do movimento.' },
  'cadeira-extensora': { muscles: ['Quadríceps'], tip: 'Ajuste o eixo da máquina na linha do joelho e segure um instante no topo.' },
  'mesa-flexora': { muscles: ['Posterior de coxa'], tip: 'Mantenha o quadril apoiado e controle a volta para não deixar o peso despencar.' },
  'cadeira-flexora': { muscles: ['Posterior de coxa'], tip: 'Encoste bem as costas e faça a flexão sem levantar o quadril do assento.' },
  'cadeira-adutora': { muscles: ['Adutores'], tip: 'Feche as pernas de forma controlada e não deixe a carga puxar rapidamente na volta.' },
  'cadeira-abdutora': { muscles: ['Glúteos'], tip: 'Abra as pernas sem impulso e segure brevemente na maior abertura confortável.' },
  panturrilha: { muscles: ['Panturrilhas'], tip: 'Use a amplitude completa: desça o calcanhar, suba o máximo e faça uma pequena pausa no topo.' },
  'puxada-alta': { muscles: ['Costas', 'Bíceps'], tip: 'Leve os cotovelos para baixo, mantenha o peito aberto e não puxe a barra atrás da cabeça.' },
  'remada-principal': { muscles: ['Costas'], tip: 'Mantenha o abdômen firme e puxe com os cotovelos sem transformar o movimento em balanço.' },
  'fly-inverso': { muscles: ['Ombro posterior', 'Costas'], tip: 'Abra os braços com leve flexão nos cotovelos e mantenha o pescoço relaxado.' },
  'supino-estimulo': { muscles: ['Peito', 'Tríceps'], tip: 'Use carga moderada neste segundo estímulo e preserve a execução mesmo já estando cansado.' },
  'rosca-direta': { muscles: ['Bíceps'], tip: 'Mantenha os cotovelos parados e evite inclinar o tronco para ajudar a subir a barra.' },
  'rosca-martelo': { muscles: ['Bíceps', 'Antebraço'], tip: 'Mantenha as palmas voltadas uma para a outra e controle todo o caminho de volta.' },
};

workoutPlan.days.forEach((day) => {
  day.exercises.forEach((exercise) => Object.assign(exercise, exerciseDetails[exercise.id] || {}));
});
