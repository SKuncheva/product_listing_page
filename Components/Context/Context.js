import { createContext ,useState} from "react";

export const GenderContext = createContext();

export const GenderProvider = ({ children }) => {
  const [gender, setGender] = useState('women');

  const currentGender = (value) => {
    setGender(value);
  };

  const context = {
    gender,
    currentGender,
  };

  return (
    <>
      <GenderContext.Provider value={context}>{children}</GenderContext.Provider>
    </>
  );
};