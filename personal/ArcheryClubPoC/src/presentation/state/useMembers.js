import { useEffect, useState } from "react";

export function useMembers({ getMembersUseCase, addMemberUseCase }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    getMembersUseCase
      .execute()
      .then((list) => setMembers(list))
      .catch((err) => setError(err.message || "Unable to load members"))
      .finally(() => setLoading(false));
  }, [getMembersUseCase]);

  const addMember = async (member) => {
    try {
      setLoading(true);
      const newMember = await addMemberUseCase.execute(member);
      setMembers((prev) => [...prev, newMember]);
      setError(null);
      return newMember;
    } catch (err) {
      setError(err.message || "Unable to add member");
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { members, loading, error, addMember };
}
