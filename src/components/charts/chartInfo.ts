/**
 * Plain-language explanations for every chart in the "Last hours" and "10-min statistics" tabs:
 * what the figure shows, what it is useful for, and what a visitor can conclude from it.
 * Public-facing text (en-GB), shown from the ⓘ button and in the enlarged view.
 */

export interface ChartExplanation {
  /** What is plotted and where the numbers come from. */
  shows: string;
  /** Why the figure is useful. */
  why: string;
  /** Things to look for and what they tell you. */
  insights: string[];
}

export const CHART_INFO = {
  /* ---------------- Last hours (instantaneous data) ---------------- */
  trendPower: {
    shows:
      "The electrical power the turbine is sending to the grid, in kilowatts, read every second (last hour) or every minute (6 and 24 hours). 4,245 kW is its maximum.",
    why: "It is the turbine's output in real time: how much electricity it is producing right now and how that changes from moment to moment.",
    insights: [
      "Output rises and falls with every gust. Compare it with the wind-speed chart below: small changes in wind make big changes in power.",
      "A flat top near 4,200 kW means the turbine is at full power. In stronger wind it turns its blades to spill the extra energy instead of producing more.",
      "Zero means there is too little wind (below about 3 m/s) or the turbine is paused, for example for maintenance or by the grid operator.",
      "The area under the line is the energy produced: it is the 'Energy produced' figure above.",
    ],
  },
  trendWind: {
    shows:
      "Wind speed in metres per second, measured by the anemometer on top of the nacelle, about 92 m above the ground.",
    why: "Wind is the turbine's fuel. This chart explains almost everything the power chart does.",
    insights: [
      "Below about 3 m/s the turbine waits; between roughly 3 and 12 m/s its power climbs steeply; above that it holds its maximum.",
      "A spiky line means gusty, turbulent wind; a smooth line means steady wind, which is easier on the machine.",
      "The sensor sits behind the rotor, so it reads a little lower than the free wind in front of the blades.",
    ],
  },
  trendRotor: {
    shows: "How fast the rotor turns, in revolutions per minute (rpm).",
    why: "This turbine has no gearbox: the generator turns at exactly the rotor's speed, so this is also the generator speed.",
    insights: [
      "The rotor speeds up as the wind picks up and levels off at its top speed in strong wind; from then on the blade pitch controls the power.",
      "Variable speed lets the blades meet the wind at the best angle and keeps loads and noise down.",
      "A rotor turning slowly with almost no power is 'idling': the wind is too light to produce useful electricity.",
    ],
  },
  trendDirection: {
    shows:
      "Two compass directions: where the nacelle (and rotor) is pointing, and where the wind is coming from, in degrees from north.",
    why: "A turbine produces most when its rotor faces straight into the wind. The yaw system turns the whole nacelle on top of the tower to follow it.",
    insights: [
      "The two lines normally stay close together: the turbine is tracking the wind.",
      "The nacelle moves in occasional small steps rather than continuously, to avoid wearing out the yaw drives with every small wind shift.",
      "Large, lasting gaps between the lines usually mean the wind is turning faster than the turbine follows, or it is light and variable.",
    ],
  },
  trendReactive: {
    shows: "Reactive power, in kilovolt-amperes reactive (kvar).",
    why: "Reactive power does no useful work itself, but the grid needs it to keep its voltage steady. The turbine's converter can supply or absorb it as the network operator asks.",
    insights: [
      "Values away from zero show the turbine actively helping to hold the local grid voltage, not just producing energy.",
      "It often changes in steps when the operator changes the requested setting, independently of the wind.",
      "Compare it with the power chart: the two are controlled separately by the converter.",
    ],
  },
  trendFrequency: {
    shows: "The frequency of the electricity on the grid, in hertz, measured at the turbine.",
    why: "Every generator in Great Britain is synchronised to the same frequency, nominally 50 Hz. It is a live measure of the balance between supply and demand across the whole country.",
    insights: [
      "It is kept very close to 50 Hz (normally within 49.8–50.2 Hz). It dips when demand rises or a large power station trips, and rises when there is too much generation.",
      "The same wiggles would be seen anywhere in Great Britain at the same moment: this chart is about the national grid, not this turbine.",
      "Zoom into the last hour to see how quickly the system operator corrects the small swings.",
    ],
  },

  /* ---------------- 10-min statistics ---------------- */
  powerCurve: {
    shows:
      "Each dot is one 10-minute period: the average wind speed (across) against the average power (up). The white line is the typical (median) power at each wind speed.",
    why: "The power curve is the turbine's signature and the standard way engineers check how well a wind turbine performs.",
    insights: [
      "Its S-shape tells the whole story: nothing below about 3 m/s, a steep rise in between (power grows roughly with the cube of wind speed), and a flat top at the maximum of about 4.2 MW.",
      "Dots well below the line in good wind mean the turbine was producing less than it could: limited by the grid operator, slowed for noise or wildlife, iced up, or partly stopped for maintenance.",
      "Compare 7, 30 and 90 days: a curve that keeps its shape over time is a healthy turbine.",
    ],
  },
  dailyEnergy: {
    shows:
      "The electricity produced each day, in megawatt-hours (MWh), from the turbine's own energy records. Today's bar is still growing.",
    why: "It turns the second-by-second figures into what matters over time: energy delivered to the grid and to the community.",
    insights: [
      "The most it could ever make in a day is about 102 MWh (4.245 MW for 24 hours); the tooltip shows each day as a share of that.",
      "Windy days stand out next to calm ones: production follows the weather systems passing over Bristol.",
      "A typical UK household uses about 2,500 kWh a year, so one MWh covers roughly 5 months of a home's electricity.",
      "A day close to zero with decent wind points to maintenance or a stop.",
    ],
  },
  generatorTemps: {
    shows:
      "Temperatures of the generator's two stator windings, with the outside air temperature (measured at the hub) for comparison, as 10-minute means.",
    why: "Heat is the main limit on a generator. Watching these temperatures tells operators the cooling system is doing its job.",
    insights: [
      "The windings warm up when the turbine produces a lot and cool when the wind drops: the gap to the outside temperature follows the power.",
      "Both windings should move together; one drifting away from the other would be worth investigating.",
      "Warm days raise everything a little: the generator is cooled by outside air.",
    ],
  },
  powerBand: {
    shows:
      "The average power in each 10-minute period (line) and the lowest and highest values reached within it (shaded band).",
    why: "The average alone hides how much the output moves around. The band shows how steady or gusty each period was.",
    insights: [
      "A wide band means gusty, turbulent wind; a thin band means steady conditions.",
      "When the line and the top of the band sit at about 4,200 kW, the turbine held full power for the whole period.",
      "Gaps in the line are periods with no data.",
    ],
  },
  windBand: {
    shows:
      "The average wind speed in each 10-minute period (line) with the lowest and highest readings within it (band).",
    why: "It reveals the weather behind the production: calm spells, windy days and storms.",
    insights: [
      "The top of the band shows the gusts; a band much wider than usual is a turbulent, gusty spell.",
      "Line it up with the power chart (hover either one) to see how the turbine responded.",
      "Strong-wind spells are when the blade pitch chart rises.",
    ],
  },
  bladePitch: {
    shows: "The angle the blades are turned to, in degrees, as 10-minute means.",
    why: "Pitch is how the turbine controls its power: by turning the blades it decides how much energy to take from the wind.",
    insights: [
      "Close to 0° in light and moderate wind: the blades face the wind to catch as much as possible.",
      "It rises in strong wind to spill the excess and hold the maximum power; it rises exactly when the power chart flattens out.",
      "Around 90° the blades are 'feathered' edge-on to the wind: the turbine is stopped or parked, for example in a storm or for maintenance.",
    ],
  },
} satisfies Record<string, ChartExplanation>;
