// University of Ilorin academic structure: 16 faculties, 114 departments.
//
// Source: structure supplied by the Board (2026-11-12). This file is the seed reference for
// `pnpm db:import:structure` — it is NOT imported by the running app. Editing it and re-running
// the script is safe: the import only inserts rows that are missing and never renames or deletes.
//
// Ordering here is irrelevant — the API sorts faculties and departments by name. It is kept in
// the Board's original order so a human can diff it against the source document.
//
// NOTE: programme length is not encoded here. Every department is linked to 100–600 because the
// Board has not confirmed which departments stop at 400 or 500. See STATE.md — an Admin can trim
// a department's level set through /admin/structure/departments at any time.

export interface StructureFaculty {
  name: string;
  departments: string[];
}

export const UNILORIN_STRUCTURE: StructureFaculty[] = [
  {
    name: "Faculty of Agriculture",
    departments: [
      "Agricultural Economics and Farm Management",
      "Agricultural Extension and Rural Development",
      "Agronomy",
      "Animal Production",
      "Aquaculture and Fisheries",
      "Crop Protection",
      "Forest Resources Management",
      "Home Economics and Food Science",
    ],
  },
  {
    name: "Faculty of Arts",
    departments: [
      "Arabic and Transnational Studies",
      "English and Literary Studies",
      "French and Diplomatic Studies",
      "History and International Studies",
      "Linguistics and Nigerian Languages",
      "Religions",
      "The Performing and Film Arts",
    ],
  },
  {
    name: "Faculty of Basic Clinical Sciences",
    departments: [
      "Chemical Pathology and Immunology",
      "Haematology and Blood Transfusion",
      "Medical Laboratory Science",
      "Medical Microbiology and Parasitology",
      "Medical Radiography",
      "Pathology (Anatomic Pathology)",
      "Pharmacology and Therapeutics",
      "Physiotherapy",
    ],
  },
  {
    name: "Faculty of Basic Medical Sciences",
    departments: ["Anatomy", "Medical Biochemistry", "Physiology"],
  },
  {
    name: "Faculty of Clinical Sciences",
    departments: [
      "Anaesthesia",
      "Behavioural Sciences",
      "Dentistry",
      "Epidemiology and Community Health",
      "Family Medicine",
      "Medicine",
      "Nursing Science",
      "Obstetrics and Gynaecology",
      "Ophthalmology",
      "Otorhinolaryngology",
      "Paediatrics and Child Health",
      "Radiology",
      "Surgery",
    ],
  },
  {
    name: "Faculty of Communication and Information Sciences",
    departments: [
      "Computer Science",
      "Information Technology",
      "Library and Information Science",
      "Mass Communication",
      "Telecommunication Science",
    ],
  },
  {
    name: "Faculty of Education",
    departments: [
      "Adult and Primary Education",
      "Arts Education",
      "Educational Guidance and Counselling",
      "Educational Management",
      "Educational Technology",
      "Health Promotion and Environmental Health Education",
      "Human Kinetics Education",
      "Science Education",
      "Social Sciences Education",
    ],
  },
  {
    name: "Faculty of Engineering and Technology",
    departments: [
      "Agricultural and Biosystems Engineering",
      "Biomedical Engineering",
      "Chemical Engineering",
      "Civil Engineering",
      "Computer Engineering",
      "Electrical and Electronics Engineering",
      "Food and Bioprocess Engineering",
      "Materials and Metallurgical Engineering",
      "Mechanical Engineering",
      "Water Resources and Environmental Engineering",
    ],
  },
  {
    name: "Faculty of Environmental Sciences",
    departments: [
      "Architecture",
      "Estate Management",
      "Quantity Surveying",
      "Surveying and Geo-Informatics",
      "Urban and Regional Planning",
    ],
  },
  {
    name: "Faculty of Law",
    departments: [
      "Business Law",
      "Islamic Law",
      "Jurisprudence and International Law",
      "Private and Property Law",
      "Public Law",
    ],
  },
  {
    name: "Faculty of Life Sciences",
    departments: [
      "Biochemistry",
      "Microbiology",
      "Optometry and Vision Science",
      "Plant Biology",
      "Zoology",
    ],
  },
  {
    name: "Faculty of Management Sciences",
    departments: [
      "Accounting",
      "Business Administration",
      "Finance",
      "Industrial Relations and Personnel Management",
      "Marketing",
      "Public Administration",
    ],
  },
  {
    name: "Faculty of Pharmaceutical Sciences",
    departments: [
      "Clinical Pharmacy and Pharmacy Practice",
      "Pharmacognosy and Drug Development",
      "Pharmacology and Toxicology",
      "Pharmaceutical and Medicinal Chemistry",
      "Pharmaceutical Microbiology and Biotechnology",
      "Pharmaceutics and Industrial Pharmacy",
    ],
  },
  {
    name: "Faculty of Physical Sciences",
    departments: [
      "Chemistry",
      "Geology and Mineral Science",
      "Geophysics",
      "Industrial Chemistry",
      "Mathematics",
      "Physics",
      "Statistics",
    ],
  },
  {
    name: "Faculty of Social Sciences",
    departments: [
      "Criminology and Security Studies",
      "Economics",
      "Geography and Environmental Management",
      "Political Science",
      "Psychology",
      "Social Work",
      "Sociology",
    ],
  },
  {
    name: "Faculty of Veterinary Medicine",
    departments: [
      "Veterinary Anatomy",
      "Veterinary Medicine",
      "Veterinary Microbiology",
      "Veterinary Parasitology and Entomology",
      "Veterinary Pathology",
      "Veterinary Pharmacology and Toxicology",
      "Veterinary Physiology and Biochemistry",
      "Veterinary Public Health and Preventive Medicine",
      "Veterinary Surgery and Radiology",
      "Theriogenology and Production",
    ],
  },
];

// Every department is linked to the full 100–600 range until the Board confirms per-department
// programme lengths. Superset on purpose: a wrong extra option is a nuisance, a missing one
// blocks a real student from finishing onboarding.
export const LEVEL_VALUES = [100, 200, 300, 400, 500, 600] as const;
