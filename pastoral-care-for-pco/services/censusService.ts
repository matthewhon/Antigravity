
import { SystemSettings, CensusStats } from '../types';

interface CensusResult {
  sourceUrl: string;
  data: CensusStats | null;
  error?: string;
}

// Hardcoded key as requested
const API_KEY = '6c7efc601f5f9d5119634fd2efb22cf04311c08b';

const STATE_FIPS: Record<string, string> = {
  'AL': '01', 
  'ALABAMA': '01', 
  'AK': '02', 
  'ALASKA': '02', 
  'AZ': '04', 
  'ARIZONA': '04',
  'AR': '05', 
  'ARKANSAS': '05', 
  'CA': '06', 
  'CALIFORNIA': '06', 
  'CO': '08', 
  'COLORADO': '08',
  'CT': '09', 
  'CONNECTICUT': '09', 
  'DE': '10', 
  'DELAWARE': '10', 
  'DC': '11', 
  'DISTRICT OF COLUMBIA': '11',
  'FL': '12', 
  'FLORIDA': '12', 
  'GA': '13', 
  'GEORGIA': '13', 
  'HI': '15', 
  'HAWAII': '15',
  'ID': '16', 
  'IDAHO': '16', 
  'IL': '17', 
  'ILLINOIS': '17', 
  'IN': '18', 
  'INDIANA': '18',
  'IA': '19', 
  'IOWA': '19', 
  'KS': '20', 
  'KANSAS': '20', 
  'KY': '21', 
  'KENTUCKY': '21',
  'LA': '22', 
  'LOUISIANA': '22', 
  'ME': '23', 
  'MAINE': '23', 
  'MD': '24', 
  'MARYLAND': '24',
  'MA': '25', 
  'MASSACHUSETTS': '25', 
  'MI': '26', 
  'MICHIGAN': '26', 
  'MN': '27', 
  'MINNESOTA': '27',
  'MS': '28', 
  'MISSISSIPPI': '28', 
  'MO': '29', 
  'MISSOURI': '29', 
  'MT': '30', 
  'MONTANA': '30',
  'NE': '31', 
  'NEBRASKA': '31', 
  'NV': '32', 
  'NEVADA': '32', 
  'NH': '33', 
  'NEW HAMPSHIRE': '33',
  'NJ': '34', 
  'NEW JERSEY': '34', 
  'NM': '35', 
  'NEW MEXICO': '35', 
  'NY': '36', 
  'NEW YORK': '36',
  'NC': '37', 
  'NORTH CAROLINA': '37', 
  'ND': '38', 
  'NORTH DAKOTA': '38', 
  'OH': '39', 
  'OHIO': '39',
  'OK': '40', 
  'OKLAHOMA': '40', 
  'OR': '41', 
  'OREGON': '41', 
  'PA': '42', 
  'PENNSYLVANIA': '42',
  'RI': '44', 
  'RHODE ISLAND': '44', 
  'SC': '45', 
  'SOUTH CAROLINA': '45', 
  'SD': '46', 
  'SOUTH DAKOTA': '46',
  'TN': '47', 
  'TENNESSEE': '47', 
  'TX': '48', 
  'TEXAS': '48', 
  'UT': '49', 
  'UTAH': '49',
  'VT': '50', 
  'VERMONT': '50', 
  'VA': '51', 
  'VIRGINIA': '51', 
  'WA': '53', 
  'WASHINGTON': '53',
  'WV': '54', 
  'WEST VIRGINIA': '54', 
  'WI': '55', 
  'WISCONSIN': '55', 
  'WY': '56', 
  'WYOMING': '56'
};

const cleanLocationName = (name: string): string => {
  return name.replace(/( city| town| village| borough| cdp),/i, ',');
};

const sumKeys = (row: Record<string, string>, keys: string[]): number => {
  return keys.reduce((acc, key) => {
    const val = parseFloat(row[key]);
    // Filter out error codes (negative numbers from Census)
    return acc + (isNaN(val) || val < 0 ? 0 : val);
  }, 0);
};

const getAgeKeys = (start: number, end: number, prefix = 'B01001_'): string[] => {
  const keys = [];
  for (let i = start; i <= end; i++) {
    keys.push(`${prefix}${i.toString().padStart(3, '0')}E`);
  }
  return keys;
};

const parseCensusData = (mergedRow: Record<string, string>): CensusStats | null => {
  if (!mergedRow['B01001_001E']) return null;

  const getVal = (key: string) => {
    const v = parseFloat(mergedRow[key]);
    // Handle NaN and Census error codes (negative values like -666666666)
    return (isNaN(v) || v < 0) ? 0 : v;
  };

  const totalPopulation = getVal('B01001_001E');
  if (totalPopulation === 0) return null;

  const male = getVal('B01001_002E');
  const female = getVal('B01001_026E');

  const maleUnder18 = sumKeys(mergedRow, getAgeKeys(3, 6));
  const femaleUnder18 = sumKeys(mergedRow, getAgeKeys(27, 30));
  
  const maleYoung = sumKeys(mergedRow, getAgeKeys(7, 12));
  const femaleYoung = sumKeys(mergedRow, getAgeKeys(31, 36));

  const maleAdult = sumKeys(mergedRow, getAgeKeys(13, 19));
  const femaleAdult = sumKeys(mergedRow, getAgeKeys(37, 43));

  const maleSenior = sumKeys(mergedRow, getAgeKeys(20, 25));
  const femaleSenior = sumKeys(mergedRow, getAgeKeys(44, 49));

  const white = getVal('B03002_003E');
  const black = getVal('B03002_004E');
  const hispanic = getVal('B03002_012E');
  const asian = getVal('B03002_006E');
  const other = Math.max(0, totalPopulation - (white + black + hispanic + asian));

  const medianHouseholdIncome = getVal('B19013_001E');
  
  const povUniverse = getVal('B17001_001E');
  const povCount = getVal('B17001_002E');
  const povertyRate = povUniverse > 0 ? (povCount / povUniverse) * 100 : 0;

  const laborForce = getVal('B23025_003E');
  const unemployed = getVal('B23025_005E');
  const unemploymentRate = laborForce > 0 ? (unemployed / laborForce) * 100 : 0;

  const totalHousing = getVal('B25002_001E'); // Housing Units
  const totalHouseholds = getVal('B11001_001E'); // Occupied Households
  const occupiedHousing = getVal('B25002_002E');
  const vacantHousing = getVal('B25002_003E');
  const ownerOccupiedCount = getVal('B25003_002E');
  
  const vacancyRate = totalHousing > 0 ? (vacantHousing / totalHousing) * 100 : 0;
  const ownerOccupied = occupiedHousing > 0 ? (ownerOccupiedCount / occupiedHousing) * 100 : 0;

  const eduBase = getVal('B15003_001E');
  const bach = getVal('B15003_022E');
  const masters = getVal('B15003_023E');
  const prof = getVal('B15003_024E');
  const doc = getVal('B15003_025E');
  const bachelorsPlus = eduBase > 0 ? ((bach + masters + prof + doc) / eduBase) * 100 : 0;

  const commuteTotal = getVal('B08303_001E');
  // B08303: 008E (30-34), 009E (35-39), 010E (40-44), 011E (45-59), 012E (60-89), 013E (90+)
  const commute30plus = sumKeys(mergedRow, ['B08303_008E', 'B08303_009E', 'B08303_010E', 'B08303_011E', 'B08303_012E', 'B08303_013E']);
  const commute60plusStrict = getVal('B08303_012E') + getVal('B08303_013E');

  const longCommuteRate = commuteTotal > 0 ? (commute30plus / commuteTotal) * 100 : 0;
  const veryLongCommuteRate = commuteTotal > 0 ? (commute60plusStrict / commuteTotal) * 100 : 0;

  const totalFamilies = getVal('B11003_001E');
  const singleFather = getVal('B11003_009E');
  const singleMother = getVal('B11003_016E');
  
  const singleParentRate = totalFamilies > 0 ? ((singleFather + singleMother) / totalFamilies) * 100 : 0;
  const singleMotherRate = totalFamilies > 0 ? (singleMother / totalFamilies) * 100 : 0;
  const singleFatherRate = totalFamilies > 0 ? (singleFather / totalFamilies) * 100 : 0;

  // Robust Median Age Calculation
  let medianAge = getVal('B01002_001E'); // Total Median Age
  if (medianAge <= 0) {
      // Try fallback to average of Male/Female Median Age if Total is missing/error
      const maleMedian = getVal('B01002_002E');
      const femaleMedian = getVal('B01002_003E');
      if (maleMedian > 0 && femaleMedian > 0) {
          medianAge = (maleMedian + femaleMedian) / 2;
      }
  }

  return {
    locationName: cleanLocationName(mergedRow['NAME'] || 'Unknown'),
    totalPopulation,
    gender: { male, female },
    age: {
      under18: maleUnder18 + femaleUnder18,
      youngAdults: maleYoung + femaleYoung,
      adults: maleAdult + femaleAdult,
      seniors: maleSenior + femaleSenior
    },
    ethnicity: { white, black, hispanic, asian, other },
    economics: {
      medianHouseholdIncome,
      povertyRate,
      unemploymentRate
    },
    housing: {
      ownerOccupied,
      vacancyRate,
      totalHousing,
      totalHouseholds: totalHouseholds > 0 ? totalHouseholds : occupiedHousing
    },
    education: { bachelorsPlus },
    commute: { longCommuteRate, veryLongCommuteRate },
    families: {
      totalFamilies,
      singleParentRate,
      singleMotherRate,
      singleFatherRate
    },
    demographics: {
      medianAge: medianAge > 0 ? medianAge : 0,
      marriedPop: 0, 
      nonEnglishPrimary: 0 
    }
  };
};

export const fetchCensusDataForTenant = async (
  settings: SystemSettings, 
  state?: string, 
  city?: string
): Promise<CensusResult> => {
  const apiKey = API_KEY;

  if (!state || !city || !apiKey) {
    return { sourceUrl: '', data: null, error: 'Missing configuration: City or State' };
  }

  const cleanState = state.trim();
  const cleanCity = city.trim();

  const stateFips = STATE_FIPS[cleanState.toUpperCase()] || STATE_FIPS[cleanState];
  if (!stateFips) return { sourceUrl: '', data: null, error: `Invalid State: "${cleanState}". Use full name or 2-letter code.` };

  // Use 2023 ACS 5-Year Data
  const BASE_URL = 'https://api.census.gov/data/2023/acs/acs5';

  try {
    // 1. Find Place FIPS
    const placeListUrl = `${BASE_URL}?get=NAME&for=place:*&in=state:${stateFips}&key=${apiKey}`;
    const placeRes = await fetch(placeListUrl);
    if (!placeRes.ok) throw new Error('Failed to fetch place list from Census API');
    
    const placeData = await placeRes.json();
    const cityLower = cleanCity.toLowerCase();
    
    let placeMatch = placeData.find((row: string[], i: number) => {
      if (i === 0) return false;
      const name = row[0].toLowerCase();
      // Precise match attempts
      return name === `${cityLower} city, ${cleanState.toLowerCase()}` || 
             name === `${cityLower} town, ${cleanState.toLowerCase()}` ||
             name === `${cityLower}, ${cleanState.toLowerCase()}`;
    });

    if (!placeMatch) {
      // Fallback to contains match
      placeMatch = placeData.find((row: string[], i: number) => {
        if (i === 0) return false;
        const name = row[0].toLowerCase();
        const cleanApiName = name.replace(/( city| town| village| borough| cdp),/i, ',');
        return cleanApiName.includes(cityLower) || name.includes(cityLower);
      });
    }

    if (!placeMatch) return { sourceUrl: placeListUrl, data: null, error: `City "${cleanCity}" not found in Census DB for state ${cleanState}.` };

    const placeFips = placeMatch[2];
    
    // 2. Define Variable Batches
    const batches = [
      [
        'B01001_001E', 'B01001_002E', 'B01001_026E', 
        'B01002_001E', 'B01002_002E', 'B01002_003E', // Median Age (Total, Male, Female)
        'B19013_001E', 'B17001_001E', 'B17001_002E', 'B23025_003E', 'B23025_005E', 
        'B25002_001E', 'B25002_002E', 'B25002_003E', 'B25003_002E', 
        'B15003_001E', 'B15003_022E', 'B15003_023E', 'B15003_024E', 'B15003_025E', 
        'B03002_003E', 'B03002_004E', 'B03002_012E', 'B03002_006E', 
        'B08303_001E', 'B08303_008E', 'B08303_009E', 'B08303_010E', 'B08303_011E', 'B08303_012E', 'B08303_013E', 
        'B11003_001E', 'B11003_009E', 'B11003_016E',
        'B11001_001E' // Total Households
      ],
      getAgeKeys(3, 25),
      getAgeKeys(27, 49)
    ];

    const mergedData: Record<string, string> = {};
    let finalSourceUrl = '';

    // 3. Execute Batches
    for (const batch of batches) {
      const batchUrl = `${BASE_URL}?get=${batch.join(',')}&for=place:${placeFips}&in=state:${stateFips}&key=${apiKey}`;
      if (!finalSourceUrl) finalSourceUrl = batchUrl;

      const res = await fetch(batchUrl);
      if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Batch fetch failed: ${res.status} ${errText}`);
      }
      
      const json = await res.json();
      if (json.length < 2) continue;

      const headers = json[0];
      const row = json[1];

      headers.forEach((h: string, idx: number) => {
         mergedData[h] = row[idx];
      });
      if (mergedData['NAME']) mergedData['NAME'] = row[headers.indexOf('NAME')]; 
    }

    if (!mergedData['NAME']) mergedData['NAME'] = placeMatch[0];

    const stats = parseCensusData(mergedData);
    return { sourceUrl: finalSourceUrl, data: stats };

  } catch (e: any) {
    console.error("Census Fetch Error", e);
    return { sourceUrl: '', data: null, error: e.message };
  }
};
