import "./App.css";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { HomePage } from "./presentation/pages/HomePage";
import { InMemoryMemberDataSource } from "./data/sources/InMemoryMemberDataSource";
import { MemberRepositoryImpl } from "./data/repositories/MemberRepositoryImpl";
import { GetMembersUseCase } from "./usecases/GetMembersUseCase";
import { AddMemberUseCase } from "./usecases/AddMemberUseCase";

const dataSource = new InMemoryMemberDataSource();
const memberRepository = new MemberRepositoryImpl({ dataSource });
const getMembersUseCase = new GetMembersUseCase({ memberRepository });
const addMemberUseCase = new AddMemberUseCase({ memberRepository });

function App() {
  return (
    <Router>
      <Routes>
        <Route
          path="/*"
          element={
            <HomePage
              getMembersUseCase={getMembersUseCase}
              addMemberUseCase={addMemberUseCase}
            />
          }
        />
      </Routes>
    </Router>
  );
}

export default App;
