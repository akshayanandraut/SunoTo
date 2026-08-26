const ADJECTIVES=["Quiet","Sunny","Lazy","Curious","Bold","Chill","Witty","Gentle","Rusty","Cosmic","Velvet","Golden","Silent","Mellow","Cheeky","Breezy","Nimble","Dusty","Frosty","Lucky","Sleepy","Vivid","Amber","Crimson","Electric","Fuzzy","Hidden","Jolly","Loyal","Misty","Northern","Odd","Plucky","Quick","Rogue","Salty","Tiny","Urban","Wandering","Zesty"];
const NOUNS=["Wanderer","Otter","Falcon","Panda","Comet","Maple","Tiger","River","Sparrow","Nebula","Fox","Cactus","Pixel","Wolf","Ember","Harbor","Lantern","Meadow","Orbit","Pepper","Quartz","Raven","Willow","Yeti","Zephyr","Badger","Coral","Dune","Echo","Feather","Grove","Heron","Iris","Jasper","Koala","Lynx","Mango","Nova","Otterpop","Puma"];
export function generateRedditHandle(random=Math.random){
  const adjective=ADJECTIVES[Math.floor(random()*ADJECTIVES.length)],noun=NOUNS[Math.floor(random()*NOUNS.length)],number=1+Math.floor(random()*998);
  return `${adjective}${noun}${number}`;
}
